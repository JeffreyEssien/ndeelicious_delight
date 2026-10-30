import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { isPushConfigured, removeSubscription, saveSubscription } from "@/lib/push/send";
import { pushSubscriptionSchema } from "@/lib/push/validation";
import { enforcePublicRateLimit } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";

// The customer proves the order is theirs the same way the site already lets them see it:
// the Stripe session from the success page, or the order number with its email.
const schema = z.object({
  subscription: pushSubscriptionSchema,
  orderNumber: z
    .string()
    .trim()
    .regex(/^ND-\d+$/i),
  sessionId: z
    .string()
    .trim()
    .regex(/^cs_(test_|live_)?[A-Za-z0-9_]+$/)
    .max(255)
    .optional(),
  email: z.string().trim().email().optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  if (!isPushConfigured()) return Response.json({ error: "Notifications are not available." }, { status: 503 });
  const limited = await enforcePublicRateLimit(request, { scope: "push-subscribe", maximum: 20, windowSeconds: 900 });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.sessionId && !parsed.data.email))
    return Response.json({ error: "Check your order details." }, { status: 400 });
  const db = createServiceClient();
  const orderNumber = parsed.data.orderNumber.toUpperCase();
  let orderId: string | undefined;
  if (parsed.data.sessionId) {
    const { data } = await db
      .from("payments")
      .select("orders!inner(id,order_number)")
      .eq("provider", "stripe")
      .eq("provider_payment_id", parsed.data.sessionId)
      .eq("orders.order_number", orderNumber)
      .maybeSingle();
    const order = Array.isArray(data?.orders) ? data?.orders[0] : data?.orders;
    orderId = order?.id;
  } else {
    const { data } = await db
      .from("orders")
      .select("id")
      .eq("order_number", orderNumber)
      .eq("email", parsed.data.email?.toLowerCase())
      .maybeSingle();
    orderId = data?.id;
  }
  if (!orderId) return Response.json({ error: "No matching order was found." }, { status: 404 });
  try {
    await saveSubscription(db, { audience: "customer", orderId }, parsed.data.subscription);
  } catch {
    return Response.json({ error: "We couldn’t turn on notifications. Please try again." }, { status: 500 });
  }
  return Response.json({ ok: true }, { status: 201 });
}

// Knowing the endpoint is proof enough: only the browser that subscribed has it.
export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = z
    .object({ endpoint: pushSubscriptionSchema.shape.endpoint })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid subscription." }, { status: 400 });
  await removeSubscription(createServiceClient(), parsed.data.endpoint);
  return Response.json({ ok: true });
}
