import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

export type PushMessage = { title: string; body: string; url: string; tag?: string };
type Subscription = { id: string; endpoint: string; p256dh: string; auth: string; failure_count: number };

/** Push is optional: without VAPID keys nothing is offered or sent. */
export function isPushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim() &&
      process.env.VAPID_SUBJECT?.trim(),
  );
}

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() ?? "",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "",
    process.env.VAPID_PRIVATE_KEY?.trim() ?? "",
  );
  configured = true;
}

async function deliver(db: SupabaseClient, subscriptions: Subscription[], message: PushMessage) {
  if (!isPushConfigured() || !subscriptions.length) return 0;
  configure();
  const payload = JSON.stringify(message);
  let sent = 0;
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { TTL: 24 * 60 * 60, urgency: "high" },
        );
        sent++;
        await db
          .from("push_subscriptions")
          .update({ failure_count: 0, last_sent_at: new Date().toISOString() })
          .eq("id", subscription.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404/410: the browser revoked it. Repeated failures: the endpoint is dead.
        if (status === 404 || status === 410 || subscription.failure_count >= 4)
          await db.from("push_subscriptions").delete().eq("id", subscription.id);
        else
          await db
            .from("push_subscriptions")
            .update({ failure_count: subscription.failure_count + 1 })
            .eq("id", subscription.id);
      }
    }),
  );
  return sent;
}

const columns = "id,endpoint,p256dh,auth,failure_count";

/** Never throws: a push problem must not fail an order, payment or email. */
export async function pushToOrder(db: SupabaseClient, orderId: string, message: PushMessage) {
  if (!isPushConfigured()) return 0;
  try {
    const { data } = await db
      .from("push_subscriptions")
      .select(columns)
      .eq("audience", "customer")
      .eq("order_id", orderId);
    return await deliver(db, (data ?? []) as Subscription[], message);
  } catch {
    return 0;
  }
}

export async function pushToAdmins(db: SupabaseClient, message: PushMessage) {
  if (!isPushConfigured()) return 0;
  try {
    const { data } = await db
      .from("push_subscriptions")
      .select(`${columns},admins!inner(active)`)
      .eq("audience", "admin")
      .eq("admins.active", true);
    return await deliver(db, (data ?? []) as unknown as Subscription[], message);
  } catch {
    return 0;
  }
}

export async function saveSubscription(
  db: SupabaseClient,
  owner: { audience: "admin"; adminId: string } | { audience: "customer"; orderId: string },
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
) {
  const match = owner.audience === "admin" ? { admin_id: owner.adminId } : { order_id: owner.orderId };
  // Re-subscribing replaces the old keys for the same browser and owner.
  await db
    .from("push_subscriptions")
    .delete()
    .eq("audience", owner.audience)
    .eq("endpoint", subscription.endpoint)
    .match(match);
  const { error } = await db.from("push_subscriptions").insert({
    audience: owner.audience,
    ...match,
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
  });
  if (error) throw error;
}

export async function removeSubscription(db: SupabaseClient, endpoint: string, adminId?: string) {
  let query = db.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (adminId) query = query.eq("admin_id", adminId);
  await query;
}
