import { calculateLineTaxes } from "@/features/tax/calculator";
import type { DeliveryTaxMode, TaxSnapshot } from "@/features/tax/types";
import { variantPrice } from "@/features/catalog/pricing";
import type { CartLine, Fulfilment, Product } from "@/types";
import { formatMoney } from "@/lib/format";

export type CouponRule = {
  id?: string;
  code: string;
  type: "PERCENTAGE" | "FIXED";
  value: number;
  minimumOrder: number;
  maximumDiscount?: number;
  startsAt?: Date;
  expiresAt?: Date;
  usageLimit?: number;
  usageCount?: number;
  perCustomerLimit?: number;
  active: boolean;
  productIds?: string[];
  categoryIds?: string[];
};

export type OrderQuote = {
  taxSnapshot: TaxSnapshot;
  lines: Array<{
    productId: string;
    variantId: string;
    sku: string;
    name: string;
    variantName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  preparationHours: number;
  preparationReadyAt: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  taxTotal: number;
  taxRateBps: number;
  grandTotal: number;
  couponCode?: string;
};

export class CommerceError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "CommerceError";
  }
}

export function assertFulfilmentAvailable(input: {
  fulfilment: Fulfilment;
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
}) {
  if (input.fulfilment === "delivery" && input.deliveryEnabled === false)
    throw new CommerceError("DELIVERY_DISABLED", "Delivery is not currently available.");
  if (input.fulfilment === "pickup" && input.pickupEnabled === false)
    throw new CommerceError("PICKUP_DISABLED", "Pickup is not currently available.");
}

export function calculateOrderQuote(input: {
  cart: CartLine[];
  products: Product[];
  fulfilment: Fulfilment;
  deliveryFee?: number;
  deliveryMinimum?: number;
  orderMinimum?: number;
  deliveryEnabled?: boolean;
  pickupEnabled?: boolean;
  coupon?: CouponRule;
  currency?: string;
  locale?: string;
  taxEnabled?: boolean;
  taxRateBps?: number;
  taxDelivery?: boolean;
  now?: Date;
  deliveryTaxMode?: DeliveryTaxMode | null;
}): OrderQuote {
  assertFulfilmentAvailable(input);
  if (!input.cart.length) throw new CommerceError("EMPTY_CART", "Your basket is empty.");
  const lines = input.cart.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1)
      throw new CommerceError("INVALID_QUANTITY", "Choose a valid quantity.");
    const product = input.products.find((p) => p.id === line.productId);
    if (!product || product.status === "DRAFT" || product.status === "ARCHIVED")
      throw new CommerceError("PRODUCT_UNAVAILABLE", "A product in your basket is no longer available.");
    const variant = product.variants.find((v) => v.id === line.variantId);
    if (!variant || variant.active === false || product.status === "OUT_OF_STOCK")
      throw new CommerceError("VARIANT_UNAVAILABLE", `${product.name} is currently unavailable.`);
    if (product.trackInventory !== false) {
      const available = Math.min(product.stockQuantity, variant.stockQuantity);
      if (available < 1) throw new CommerceError("VARIANT_UNAVAILABLE", `${product.name} is currently unavailable.`);
      if (line.quantity > available)
        throw new CommerceError("INSUFFICIENT_STOCK", `Only ${available} of ${product.name} remain.`);
    }
    const unitPrice = variantPrice(product, variant);
    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0)
      throw new CommerceError("INVALID_PRICE", "This item’s price needs review.");
    return {
      productId: product.id,
      variantId: variant.id,
      sku: variant.sku ?? "",
      name: product.name,
      variantName: variant.name,
      quantity: line.quantity,
      unitPrice,
      lineTotal: unitPrice * line.quantity,
    };
  });
  const preparationHours = Math.max(
    0,
    ...input.cart.map((line) => input.products.find((product) => product.id === line.productId)?.preparationHours ?? 0),
  );
  const preparationReadyAt = new Date((input.now ?? new Date()).getTime() + preparationHours * 3600000).toISOString();
  const subtotal = lines.reduce((total, line) => total + line.lineTotal, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 2147483647)
    throw new CommerceError("INVALID_ORDER_TOTAL", "This order amount needs review. Contact the bakery.");
  const orderMinimum = input.orderMinimum ?? 0;
  if (!Number.isSafeInteger(orderMinimum) || orderMinimum < 0)
    throw new CommerceError("INVALID_ORDER_MINIMUM", "The order minimum needs review.");
  if (subtotal < orderMinimum)
    throw new CommerceError(
      "ORDER_MINIMUM",
      `This order requires a subtotal of at least ${formatMoney(orderMinimum, input.currency, input.locale)}.`,
    );
  const deliveryMinimum = input.fulfilment === "delivery" ? (input.deliveryMinimum ?? 0) : 0;
  if (!Number.isSafeInteger(deliveryMinimum) || deliveryMinimum < 0)
    throw new CommerceError("INVALID_DELIVERY_MINIMUM", "The delivery minimum needs review.");
  if (subtotal < deliveryMinimum)
    throw new CommerceError(
      "DELIVERY_MINIMUM",
      `This delivery area requires a subtotal of at least ${formatMoney(deliveryMinimum, input.currency, input.locale)}.`,
    );
  const discount = input.coupon
    ? calculateDiscount(input.coupon, subtotal, lines, input.products, input.now ?? new Date())
    : 0;
  const deliveryFee = input.fulfilment === "delivery" ? (input.deliveryFee ?? 0) : 0;
  if (deliveryFee < 0 || !Number.isSafeInteger(deliveryFee))
    throw new CommerceError("INVALID_DELIVERY_FEE", "The delivery fee is invalid.");
  if (
    input.taxRateBps !== undefined &&
    (!Number.isInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > 10000)
  )
    throw new CommerceError("INVALID_TAX_RATE", "The configured tax rate needs review.");
  const taxRateBps = input.taxEnabled ? 1400 : 0;
  let taxSnapshot: TaxSnapshot;
  try {
    taxSnapshot = calculateLineTaxes({
      lines: lines.map((line, index) => {
        const product = input.products.find((item) => item.id === line.productId);
        const variant = product?.variants.find((item) => item.id === line.variantId);
        if (!product || !variant) throw new CommerceError("PRODUCT_UNAVAILABLE", "A product is no longer available.");
        const productIds = input.coupon?.productIds ?? [];
        const categoryIds = input.coupon?.categoryIds ?? [];
        return {
          id: `${line.productId}:${line.variantId}:${index}`,
          grossAmount: line.lineTotal,
          taxClass: product.taxClass ?? "REQUIRES_REVIEW",
          packQuantity: variant.packQuantity ?? null,
          discountEligible:
            (!productIds.length || productIds.includes(product.id)) &&
            (!categoryIds.length || Boolean(product.categoryId && categoryIds.includes(product.categoryId))),
        };
      }),
      discount,
      deliveryFee,
      enabled: Boolean(input.taxEnabled),
      deliveryTaxMode: input.deliveryTaxMode ?? null,
    });
  } catch (error) {
    throw new CommerceError("TAX_SETUP_REQUIRED", error instanceof Error ? error.message : "Tax setup is required.");
  }
  const taxTotal = taxSnapshot.total;
  if (subtotal - discount + deliveryFee + taxTotal > 2147483647)
    throw new CommerceError("INVALID_ORDER_TOTAL", "This order amount needs review. Contact the bakery.");
  return {
    taxSnapshot,
    preparationHours,
    preparationReadyAt,
    lines,
    subtotal,
    discount,
    deliveryFee,
    taxTotal,
    taxRateBps,
    grandTotal: subtotal - discount + deliveryFee + taxTotal,
    couponCode: input.coupon?.code,
  };
}

export function calculateDiscount(
  coupon: CouponRule,
  subtotal: number,
  lines: OrderQuote["lines"],
  products: Product[],
  now = new Date(),
) {
  if (!coupon.active) throw new CommerceError("COUPON_INACTIVE", "That coupon is not active.");
  if (coupon.startsAt && now < coupon.startsAt)
    throw new CommerceError("COUPON_NOT_STARTED", "That coupon is not active yet.");
  if (coupon.expiresAt && now > coupon.expiresAt) throw new CommerceError("COUPON_EXPIRED", "That coupon has expired.");
  if (coupon.usageLimit !== undefined && (coupon.usageCount ?? 0) >= coupon.usageLimit)
    throw new CommerceError("COUPON_USED_UP", "That coupon has reached its usage limit.");
  if (subtotal < coupon.minimumOrder) throw new CommerceError("COUPON_MINIMUM", `Spend more to use ${coupon.code}.`);
  let eligible = subtotal;
  const productIds = coupon.productIds ?? [];
  const categoryIds = coupon.categoryIds ?? [];
  if (productIds.length || categoryIds.length)
    eligible = lines
      .filter((line) => {
        const product = products.find((item) => item.id === line.productId);
        return (
          (!productIds.length || productIds.includes(line.productId)) &&
          (!categoryIds.length || (product?.categoryId ? categoryIds.includes(product.categoryId) : false))
        );
      })
      .reduce((sum, line) => sum + line.lineTotal, 0);
  if (eligible === 0) throw new CommerceError("COUPON_NOT_APPLICABLE", "That coupon does not apply to these items.");
  const raw = coupon.type === "PERCENTAGE" ? Math.floor((eligible * coupon.value) / 100) : coupon.value;
  return Math.min(raw, coupon.maximumDiscount ?? raw, eligible);
}
