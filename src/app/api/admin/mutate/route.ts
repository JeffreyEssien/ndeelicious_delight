import { z } from "zod";
import { after } from "next/server";
import { recordAdminAudit } from "@/lib/audit/admin-audit";
import { type AdminAuditTarget, readAdminAuditState } from "@/lib/audit/admin-audit-state";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import {
  InventoryConflictError,
  saveOrderInternalNote,
  setVariantInventory,
  transitionAdminOrderStatus,
} from "@/lib/data/inventory";
import { deliverPendingOrderNotifications } from "@/lib/orders/notifications";
import { sendCakeQuoteEmail } from "@/lib/cakes/notifications";
import { businessSettingsSchema, storeAppearanceSchema, storefrontContentSchema } from "@/validations/settings";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("product-status"),
    id: z.uuid(),
    status: z.enum(["ACTIVE", "OUT_OF_STOCK", "DRAFT", "ARCHIVED"]),
  }),
  z.object({
    action: z.literal("inventory"),
    id: z.uuid(),
    variantId: z.uuid(),
    quantity: z.number().int().min(0),
  }),
  z.object({
    action: z.literal("order-status"),
    orderNumber: z.string(),
    status: z.enum(["CONFIRMED", "PREPARING", "READY", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"]),
  }),
  z.object({ action: z.literal("order-note"), orderNumber: z.string(), note: z.string().trim().max(2_000) }),
  z.object({ action: z.literal("notification-retry"), orderNumber: z.string() }),
  z.object({ action: z.literal("theme"), theme: z.enum(["berry", "purple", "sunrise"]) }),
  z.object({ action: z.literal("cake-quote"), id: z.uuid(), quotedTotal: z.number().int().positive() }),
  z.object({
    action: z.literal("cake-status"),
    id: z.uuid(),
    status: z.enum([
      "QUOTE_REQUIRED",
      "QUOTE_SENT",
      "CUSTOMER_APPROVED",
      "CONFIRMED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
    ]),
  }),
  z.object({
    action: z.literal("cake-options"),
    options: z.array(
      z.object({
        id: z.string(),
        type: z.enum(["occasion", "size", "flavour", "filling", "design"]),
        name: z.string().trim().min(1).max(100),
        description: z.string().trim().max(200),
        priceAdjustment: z.number().int().min(0),
        quoteRequired: z.boolean(),
        active: z.boolean(),
        sortOrder: z.number().int().min(0),
      }),
    ),
  }),
  z.object({ action: z.literal("review-status"), id: z.uuid(), status: z.enum(["APPROVED", "REJECTED"]) }),
  z.object({
    action: z.literal("coupons"),
    coupons: z.array(
      z
        .object({
          id: z.string(),
          code: z
            .string()
            .trim()
            .min(2)
            .max(30)
            .regex(/^[A-Za-z0-9_-]+$/),
          type: z.enum(["PERCENTAGE", "FIXED"]),
          value: z.number().int().positive(),
          minimumOrder: z.number().int().min(0),
          maximumDiscount: z.number().int().positive().nullable(),
          usageLimit: z.number().int().positive().nullable(),
          perCustomerLimit: z.number().int().positive().nullable(),
          active: z.boolean(),
          startsAt: z.iso.datetime().nullable(),
          expiresAt: z.iso.datetime().nullable(),
          productIds: z.array(z.uuid()).max(200),
          categoryIds: z.array(z.uuid()).max(50),
        })
        .refine((coupon) => coupon.type !== "PERCENTAGE" || coupon.value <= 100, {
          message: "Percentage discounts cannot exceed 100%.",
        })
        .refine((coupon) => !coupon.startsAt || !coupon.expiresAt || coupon.startsAt < coupon.expiresAt, {
          message: "Coupon expiry must be after its start date.",
        }),
    ),
  }),
  z.object({
    action: z.literal("delivery-zones"),
    zones: z.array(
      z.object({
        id: z.string(),
        name: z.string().min(2),
        fee: z.number().int().min(0),
        estimate: z.string().max(100),
        minimumOrder: z.number().int().min(0),
        active: z.boolean(),
      }),
    ),
  }),
  z.object({
    action: z.literal("settings"),
    key: z.enum(["content", "business", "appearance"]),
    value: z.record(z.string(), z.unknown()),
  }),
]);

type AdminMutation = z.infer<typeof schema>;

function auditDescriptor(input: AdminMutation): {
  action: string;
  entityType: string;
  entityId: string;
  target: AdminAuditTarget;
} {
  switch (input.action) {
    case "product-status":
      return {
        action: "PRODUCT_STATUS_CHANGED",
        entityType: "product",
        entityId: input.id,
        target: { type: "product", id: input.id },
      };
    case "inventory":
      return {
        action: "STOCK_CHANGED",
        entityType: "product",
        entityId: input.id,
        target: { type: "product", id: input.id },
      };
    case "order-status":
      return {
        action: "ORDER_STATUS_CHANGED",
        entityType: "order",
        entityId: input.orderNumber,
        target: { type: "order", orderNumber: input.orderNumber },
      };
    case "order-note":
      return {
        action: "ORDER_NOTE_CHANGED",
        entityType: "order",
        entityId: input.orderNumber,
        target: { type: "order", orderNumber: input.orderNumber },
      };
    case "notification-retry":
      return {
        action: "ORDER_NOTIFICATION_RETRY_REQUESTED",
        entityType: "order",
        entityId: input.orderNumber,
        target: { type: "order", orderNumber: input.orderNumber },
      };
    case "theme":
      return {
        action: "THEME_CHANGED",
        entityType: "site_setting",
        entityId: "theme",
        target: { type: "site-setting", key: "theme" },
      };
    case "cake-quote":
      return {
        action: "CAKE_QUOTE_SENT",
        entityType: "custom_cake_order",
        entityId: input.id,
        target: { type: "cake-order", id: input.id },
      };
    case "cake-status":
      return {
        action: "CAKE_REQUEST_STATUS_CHANGED",
        entityType: "custom_cake_order",
        entityId: input.id,
        target: { type: "cake-order", id: input.id },
      };
    case "cake-options":
      return {
        action: "CAKE_OPTIONS_CHANGED",
        entityType: "custom_cake_options",
        entityId: "all",
        target: { type: "cake-options" },
      };
    case "review-status":
      return {
        action: "REVIEW_STATUS_CHANGED",
        entityType: "review",
        entityId: input.id,
        target: { type: "review", id: input.id },
      };
    case "coupons":
      return { action: "COUPONS_CHANGED", entityType: "coupons", entityId: "all", target: { type: "coupons" } };
    case "delivery-zones":
      return {
        action: "DELIVERY_ZONES_CHANGED",
        entityType: "delivery_zones",
        entityId: "all",
        target: { type: "delivery-zones" },
      };
    case "settings":
      return {
        action: "SITE_SETTING_CHANGED",
        entityType: "site_setting",
        entityId: input.key,
        target: { type: "site-setting", key: input.key },
      };
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid admin update." }, { status: 400 });
  const supabase = auth.db;
  const input = parsed.data;
  const audit = auditDescriptor(input);
  let previousValue: unknown;
  try {
    previousValue = await readAdminAuditState(supabase, audit.target);
  } catch {
    return Response.json({ error: "The current value could not be verified for auditing." }, { status: 500 });
  }
  let error: { message: string } | null | undefined;
  if (input.action === "product-status")
    ({ error } = await supabase
      .from("products")
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq("id", input.id));
  if (input.action === "inventory") {
    try {
      await setVariantInventory(supabase, input.id, input.variantId, input.quantity);
    } catch (reason) {
      if (reason instanceof InventoryConflictError)
        return Response.json({ error: reason.message, code: reason.code }, { status: 409 });
      error = { message: "Inventory update failed." };
    }
  }
  if (input.action === "order-status") {
    try {
      await transitionAdminOrderStatus(supabase, input.orderNumber, input.status, auth.admin.id);
      after(() => deliverPendingOrderNotifications(supabase, input.orderNumber));
    } catch (reason) {
      if (reason instanceof InventoryConflictError)
        return Response.json({ error: reason.message, code: reason.code }, { status: 409 });
      error = { message: "Order status transition failed." };
    }
  }
  if (input.action === "order-note") {
    try {
      await saveOrderInternalNote(supabase, input.orderNumber, input.note, auth.admin.id);
    } catch {
      error = { message: "Order note update failed." };
    }
  }
  if (input.action === "notification-retry") after(() => deliverPendingOrderNotifications(supabase, input.orderNumber));
  if (input.action === "theme")
    ({ error } = await supabase
      .from("site_settings")
      .upsert({ key: "theme", value: input.theme, updated_at: new Date().toISOString() }, { onConflict: "key" }));
  if (input.action === "cake-quote")
    ({ error } = await supabase
      .from("custom_cake_orders")
      .update({
        quoted_total: input.quotedTotal,
        status: "QUOTE_SENT",
        quote_expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.id));
  if (input.action === "cake-status")
    ({ error } = await supabase
      .from("custom_cake_orders")
      .update({ status: input.status, updated_at: new Date().toISOString() })
      .eq("id", input.id));
  if (input.action === "cake-options") {
    const current = await supabase.from("custom_cake_options").select("id");
    if (current.error) error = current.error;
    const submittedIds = new Set(
      input.options.map((option) => option.id).filter((id) => z.uuid().safeParse(id).success),
    );
    if (!error) {
      const removed = (current.data ?? []).map((row) => row.id).filter((id) => !submittedIds.has(id));
      if (removed.length) {
        const result = await supabase.from("custom_cake_options").update({ active: false }).in("id", removed);
        error = result.error;
      }
    }
    if (!error)
      for (const option of input.options) {
        const values = {
          type: option.type,
          name: option.name,
          description: option.description || null,
          price_adjustment: option.priceAdjustment,
          quote_required: option.quoteRequired,
          active: option.active,
          sort_order: option.sortOrder,
        };
        const result = z.uuid().safeParse(option.id).success
          ? await supabase.from("custom_cake_options").update(values).eq("id", option.id)
          : await supabase.from("custom_cake_options").insert(values);
        if (result.error) {
          error = result.error;
          break;
        }
      }
  }
  if (input.action === "review-status")
    ({ error } = await supabase
      .from("reviews")
      .update({ status: input.status })
      .eq("id", input.id)
      .eq("verified_purchase", true));
  if (input.action === "coupons") {
    const values = input.coupons.map((coupon) => ({
      id: z.uuid().safeParse(coupon.id).success ? coupon.id : crypto.randomUUID(),
      code: coupon.code.trim().toUpperCase(),
      type: coupon.type,
      value: coupon.value,
      minimum_order: coupon.minimumOrder,
      maximum_discount: coupon.maximumDiscount,
      usage_limit: coupon.usageLimit,
      per_customer_limit: coupon.perCustomerLimit,
      active: coupon.active,
      starts_at: coupon.startsAt,
      expires_at: coupon.expiresAt,
      product_ids: coupon.productIds,
      category_ids: coupon.categoryIds,
      updated_at: new Date().toISOString(),
    }));
    if (values.length) ({ error } = await supabase.from("coupons").upsert(values));
  }
  if (input.action === "delivery-zones") {
    const values = input.zones.map((zone, index) => ({
      id: z.uuid().safeParse(zone.id).success ? zone.id : crypto.randomUUID(),
      name: zone.name.trim(),
      fee: zone.fee,
      minimum_order: zone.minimumOrder,
      estimated_time: zone.estimate.trim() || null,
      active: zone.active,
      sort_order: index,
      updated_at: new Date().toISOString(),
    }));
    if (values.length) ({ error } = await supabase.from("delivery_zones").upsert(values));
  }
  if (input.action === "settings")
    if (input.key === "business") {
      const business = businessSettingsSchema.safeParse(input.value);
      if (!business.success)
        return Response.json({ error: "Check the business settings and try again." }, { status: 400 });
      ({ error } = await supabase
        .from("site_settings")
        .upsert({ key: input.key, value: business.data, updated_at: new Date().toISOString() }, { onConflict: "key" }));
    } else {
      const settingSchema = input.key === "content" ? storefrontContentSchema : storeAppearanceSchema;
      const settingValue = settingSchema.safeParse(input.value);
      if (!settingValue.success)
        return Response.json({ error: "Check the storefront settings and try again." }, { status: 400 });
      ({ error } = await supabase
        .from("site_settings")
        .upsert(
          { key: input.key, value: settingValue.data, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        ));
    }
  if (error) return Response.json({ error: "The update could not be saved." }, { status: 500 });
  try {
    const newValue = await readAdminAuditState(supabase, audit.target);
    await recordAdminAudit(supabase, auth, { ...audit, previousValue, newValue });
  } catch {
    return Response.json(
      { error: "The update was saved, but its audit record could not be verified." },
      { status: 500 },
    );
  }
  if (input.action === "cake-quote") after(() => sendCakeQuoteEmail(supabase, input.id));
  return Response.json({ ok: true });
}
