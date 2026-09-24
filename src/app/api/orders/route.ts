import { checkoutSchema } from "@/validations/checkout";
import { assertFulfilmentAvailable, calculateOrderQuote, CommerceError } from "@/features/checkout/pricing";
import { getDeliveryZones, getProducts } from "@/lib/data/catalog";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { claimOrderCoupon, getCoupon } from "@/lib/data/coupons";
import { InventoryConflictError, reserveOrderInventory } from "@/lib/data/inventory";
import { getBusinessSettings } from "@/lib/data/settings";
import { createStripeCheckout, expireStripeCheckout, PaymentConfigurationError } from "@/lib/payments/stripe";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderNumber = () => `ND-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 10)}`;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let orderId: string | undefined;
  let checkoutSessionId: string | undefined;
  try {
    const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return Response.json(
        {
          error: issue?.message ?? "Please check your order details.",
          field: issue?.path.join("."),
          code: "INVALID_ORDER_DETAILS",
        },
        { status: 400 },
      );
    }
    const { customer, delivery, cart, couponCode } = parsed.data;
    const customerEmail = customer.email.toLowerCase();
    const [products, zones, business] = await Promise.all([getProducts(), getDeliveryZones(), getBusinessSettings()]);
    assertFulfilmentAvailable({ fulfilment: delivery.fulfilment, ...business });
    const zone =
      delivery.fulfilment === "delivery" ? zones.find((item) => item.id === delivery.zoneId && item.active) : undefined;
    if (delivery.fulfilment === "delivery" && !zone)
      return Response.json({ error: "That delivery zone is unavailable." }, { status: 400 });
    const coupon = await getCoupon(couponCode);
    if (couponCode && !coupon) return Response.json({ error: "That coupon is not valid." }, { status: 400 });
    const quote = calculateOrderQuote({
      cart,
      products,
      fulfilment: delivery.fulfilment,
      deliveryFee: zone?.fee,
      deliveryMinimum: zone?.minimumOrder,
      orderMinimum: business.orderMinimum,
      deliveryEnabled: business.deliveryEnabled,
      pickupEnabled: business.pickupEnabled,
      coupon,
    });
    const service = createServiceClient();
    const { data: customerRow, error: customerError } = await service
      .from("customers")
      .upsert({ email: customerEmail, name: customer.name, phone: customer.phone }, { onConflict: "email" })
      .select("id")
      .single();
    if (customerError) throw customerError;
    let addressSnapshot: Record<string, string> | null = null;
    if (delivery.fulfilment === "delivery") {
      addressSnapshot = {
        name: customer.name,
        phone: customer.phone,
        street: delivery.street,
        area: delivery.area ?? "",
        city: delivery.city,
        state: "Lagos",
        instructions: delivery.notes ?? "",
      };
      await service.from("delivery_addresses").insert({ customer_id: customerRow.id, ...addressSnapshot });
    }
    const number = orderNumber();
    const { data: order, error: orderError } = await service
      .from("orders")
      .insert({
        order_number: number,
        customer_id: customerRow.id,
        customer_name: customer.name,
        email: customerEmail,
        phone: customer.phone,
        fulfilment: delivery.fulfilment,
        delivery_zone_id: zone && uuidPattern.test(zone.id) ? zone.id : null,
        delivery_address_snapshot: addressSnapshot,
        subtotal: quote.subtotal,
        discount_total: quote.discount,
        delivery_fee: quote.deliveryFee,
        grand_total: quote.grandTotal,
        coupon_id: coupon?.id ?? null,
        customer_note: delivery.fulfilment === "delivery" ? delivery.notes : null,
      })
      .select("id,order_number")
      .single();
    if (orderError) throw orderError;
    orderId = order.id;
    const { error: itemsError } = await service.from("order_items").insert(
      quote.lines.map((line) => ({
        order_id: order.id,
        product_id: uuidPattern.test(line.productId) ? line.productId : null,
        variant_id: uuidPattern.test(line.variantId) ? line.variantId : null,
        product_name: line.name,
        variant_name: line.variantName,
        unit_price: line.unitPrice,
        quantity: line.quantity,
        final_price: line.lineTotal,
        product_snapshot: line,
      })),
    );
    if (itemsError) throw itemsError;
    await reserveOrderInventory(service, order.id, 60);
    if (coupon?.id && quote.discount > 0) await claimOrderCoupon(service, order.id, 60);
    const checkout = await createStripeCheckout({
      orderId: order.id,
      orderNumber: order.order_number,
      email: customerEmail,
      amount: quote.grandTotal,
      currency: "NGN",
    });
    checkoutSessionId = checkout.id;
    const { error: paymentError } = await service.from("payments").insert({
      order_id: order.id,
      provider: "stripe",
      provider_payment_id: checkout.id,
      status: "PENDING",
      amount: quote.grandTotal,
      currency: "NGN",
      idempotency_key: `checkout:${order.id}:initial`,
      provider_payload: {
        checkout_session_id: checkout.id,
        checkout_url: checkout.url,
        expires_at: checkout.expiresAt,
      },
    });
    if (paymentError) throw paymentError;
    return Response.json(
      {
        order: { number: order.order_number, total: quote.grandTotal, status: "PENDING_PAYMENT" },
        payment: { checkoutUrl: checkout.url },
      },
      { status: 201 },
    );
  } catch (error) {
    if (checkoutSessionId) await expireStripeCheckout(checkoutSessionId);
    if (orderId) {
      const service = createServiceClient();
      await service.from("payments").delete().eq("order_id", orderId);
      await service.from("coupon_usages").delete().eq("order_id", orderId);
      await service.from("order_items").delete().eq("order_id", orderId);
      await service.from("orders").delete().eq("id", orderId);
    }
    if (error instanceof CommerceError)
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    if (error instanceof InventoryConflictError)
      return Response.json({ error: error.message, code: error.code }, { status: 409 });
    if (error instanceof PaymentConfigurationError)
      return Response.json({ error: error.message, code: "PAYMENT_UNAVAILABLE" }, { status: 503 });
    return Response.json({ error: "We couldn’t create your order. Please try again." }, { status: 500 });
  }
}
