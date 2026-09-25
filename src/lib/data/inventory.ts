import type { SupabaseClient } from "@supabase/supabase-js";

const conflictCodes = new Set([
  "INSUFFICIENT_STOCK",
  "INVENTORY_NOT_COMMITTED",
  "INVENTORY_RESERVATION_MISSING",
  "PRODUCT_UNAVAILABLE",
  "STOCK_BELOW_RESERVED",
  "VARIANT_UNAVAILABLE",
]);

export class InventoryConflictError extends Error {
  constructor(
    readonly code = "INSUFFICIENT_STOCK",
    message = "Some items are no longer available in the requested quantity. Please review your basket.",
  ) {
    super(message);
    this.name = "InventoryConflictError";
  }
}

function inventoryCode(error: { message?: string; details?: string; hint?: string }) {
  const text = [error.message, error.details, error.hint].filter(Boolean).join(" ");
  return [...conflictCodes].find((code) => text.includes(code));
}

function conflict(error: { message?: string; details?: string; hint?: string }) {
  const code = inventoryCode(error) ?? "INSUFFICIENT_STOCK";
  return new InventoryConflictError(
    code,
    code === "STOCK_BELOW_RESERVED"
      ? "Stock cannot be reduced below the quantity held for pending orders."
      : code === "INVENTORY_NOT_COMMITTED"
        ? "Mark the order as paid before moving it into fulfilment."
        : undefined,
  );
}

export async function reserveOrderInventory(db: SupabaseClient, orderId: string, holdMinutes = 60) {
  const { data, error } = await db.rpc("reserve_order_inventory", {
    p_order_id: orderId,
    p_hold_minutes: holdMinutes,
  });
  if (error) {
    if (inventoryCode(error)) throw conflict(error);
    throw error;
  }
  return typeof data === "string" ? new Date(data) : null;
}

export async function transitionOrderStatus(db: SupabaseClient, orderNumber: string, status: string) {
  const { error } = await db.rpc("transition_order_status", {
    p_order_number: orderNumber,
    p_status: status,
  });
  if (error) {
    if (inventoryCode(error)) throw conflict(error);
    throw error;
  }
}

export async function transitionAdminOrderStatus(
  db: SupabaseClient,
  orderNumber: string,
  status: string,
  adminId: string,
) {
  const { error } = await db.rpc("admin_transition_order_status", {
    p_order_number: orderNumber,
    p_status: status,
    p_admin_id: adminId,
  });
  if (error) {
    if (inventoryCode(error)) throw conflict(error);
    throw error;
  }
}

export async function saveOrderInternalNote(db: SupabaseClient, orderNumber: string, note: string, adminId: string) {
  const { error } = await db.rpc("add_order_internal_note", {
    p_order_number: orderNumber,
    p_note: note,
    p_admin_id: adminId,
  });
  if (error) throw error;
}

export async function setVariantInventory(db: SupabaseClient, productId: string, variantId: string, quantity: number) {
  const { error } = await db.rpc("set_variant_inventory", {
    p_product_id: productId,
    p_variant_id: variantId,
    p_quantity: quantity,
  });
  if (error) {
    if (inventoryCode(error)) throw conflict(error);
    throw error;
  }
}
