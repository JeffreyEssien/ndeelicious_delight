import { checkoutSchema } from "@/validations/checkout";
import { calculateOrderQuote, CommerceError } from "@/features/checkout/pricing";
import { getDeliveryZones, getProducts } from "@/lib/data/catalog";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { getCoupon } from "@/lib/data/coupons";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderNumber = () => `ND-${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 10)}`;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  let orderId: string | undefined;
  try {
    const parsed = checkoutSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Please check your order details." }, { status: 400 });
    const { customer, delivery, cart, couponCode } = parsed.data;
    const customerEmail = customer.email.toLowerCase();
    const [products, zones] = await Promise.all([getProducts(), getDeliveryZones()]);
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
    if (coupon?.id && quote.discount > 0) {
      const { error: usageError } = await service.from("coupon_usages").insert({
        coupon_id: coupon.id,
        order_id: order.id,
        customer_id: customerRow.id,
        discount_amount: quote.discount,
      });
      if (usageError) throw usageError;
    }
    const summary = quote.lines
      .map((line) => `<li>${escapeHtml(line.name)} · ${escapeHtml(line.variantName)} × ${line.quantity}</li>`)
      .join("");
    const adminEmail = process.env.ADMIN_EMAIL;
    await Promise.all([
      sendTransactionalEmail({
        to: customerEmail,
        subject: `Order ${order.order_number} received`,
        html: emailFrame(
          "Your order is with us",
          `<p>Thank you, ${escapeHtml(customer.name)}. We received order <b>${escapeHtml(order.order_number)}</b>.</p><ul>${summary}</ul><p>We’ll confirm payment and fulfilment details shortly.</p>`,
        ),
      }),
      adminEmail
        ? sendTransactionalEmail({
            to: adminEmail,
            subject: `New order ${order.order_number}`,
            html: emailFrame(
              "A new order arrived",
              `<p>${escapeHtml(customer.name)} placed order <b>${escapeHtml(order.order_number)}</b>.</p><ul>${summary}</ul>`,
            ),
          })
        : Promise.resolve({ sent: false }),
    ]);
    return Response.json(
      { order: { number: order.order_number, total: quote.grandTotal, status: "PENDING_PAYMENT" } },
      { status: 201 },
    );
  } catch (error) {
    if (orderId) {
      const service = createServiceClient();
      await service.from("coupon_usages").delete().eq("order_id", orderId);
      await service.from("order_items").delete().eq("order_id", orderId);
      await service.from("orders").delete().eq("id", orderId);
    }
    if (error instanceof CommerceError)
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    return Response.json({ error: "We couldn’t create your order. Please try again." }, { status: 500 });
  }
}
