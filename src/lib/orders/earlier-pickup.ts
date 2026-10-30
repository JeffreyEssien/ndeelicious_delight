import type { SupabaseClient } from "@supabase/supabase-js";
import { earliestFulfilment } from "@/features/fulfilment/schedule";
import type { FulfilmentSchedule } from "@/features/fulfilment/types";
import { getBusinessSettings } from "@/lib/data/settings";
import { deliverPendingOrderNotifications } from "./notifications";

const localDate = (at: Date, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    at,
  );

/** The new pickup time for an order, or null when the schedule doesn't bring it forward a day or more. */
export function earlierPickup(input: {
  schedule: FulfilmentSchedule;
  placedAt: Date;
  preparationHours: number;
  /** The order's current pickup time (orders.preparation_ready_at). */
  current: Date | null;
  now?: Date;
}) {
  if (!input.current) return null;
  try {
    const slot = earliestFulfilment({
      mode: "pickup",
      schedule: input.schedule,
      preparationHours: input.preparationHours,
      now: input.placedAt,
      notBefore: input.now ?? new Date(),
    });
    return slot.date < localDate(input.current, input.schedule.timezone) ? slot : null;
  } catch {
    return null;
  }
}

/**
 * After the pickup schedule changes, move open pickup orders to the earliest time the new schedule
 * allows and email those customers. Orders only ever move earlier, so running it twice sends nothing new.
 * The order's fulfilment_snapshot is immutable, so the new time lives in preparation_ready_at.
 */
export async function offerEarlierPickups(db: SupabaseClient, now = new Date()) {
  const business = await getBusinessSettings(db);
  const schedule = business.fulfilmentSchedule;
  if (!schedule?.pickupEnabled || !business.pickupEnabled) return [];
  const { data: orders } = await db
    .from("orders")
    .select("id,order_number,email,created_at,preparation_ready_at,order_items(product_id)")
    .eq("fulfilment", "pickup")
    .in("status", ["PAID", "CONFIRMED", "PREPARING"]);
  if (!orders?.length) return [];
  const productIds = [...new Set(orders.flatMap((order) => order.order_items.map((item) => item.product_id)))];
  const { data: products } = await db
    .from("products")
    .select("id,preparation_hours")
    .in(
      "id",
      productIds.filter((id): id is string => Boolean(id)),
    );
  const hours = new Map((products ?? []).map((product) => [product.id, Number(product.preparation_hours) || 0]));
  const moved: string[] = [];
  for (const order of orders) {
    // Quoted custom cakes carry their own lead time, so leave them alone.
    if (order.order_items.some((item) => !item.product_id || !hours.has(item.product_id))) continue;
    const slot = earlierPickup({
      schedule,
      placedAt: new Date(order.created_at),
      preparationHours: Math.max(0, ...order.order_items.map((item) => hours.get(item.product_id) ?? 0)),
      current: order.preparation_ready_at ? new Date(order.preparation_ready_at) : null,
      now,
    });
    if (!slot) continue;
    const { error } = await db
      .from("orders")
      .update({ preparation_ready_at: slot.earliestAt, updated_at: now.toISOString() })
      .eq("id", order.id);
    if (error) continue;
    await db.from("order_notifications").upsert(
      {
        order_id: order.id,
        event_type: "EARLIER_PICKUP",
        recipient: order.email,
        status: "PENDING",
        attempts: 0,
        last_error: null,
        sent_at: null,
        next_attempt_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "order_id,event_type,recipient" },
    );
    moved.push(order.order_number);
  }
  for (const number of moved) await deliverPendingOrderNotifications(db, number);
  return moved;
}
