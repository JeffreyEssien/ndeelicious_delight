import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { logError } from "@/lib/observability/log";
import { enforcePublicRateLimit } from "@/lib/security/rate-limit";

const metadataValue = z.union([z.string().max(100), z.number().finite(), z.boolean()]);
const eventSchema = z.object({
  eventName: z.enum([
    "PRODUCT_VIEWED",
    "ADD_TO_CART",
    "REMOVE_FROM_CART",
    "CHECKOUT_STARTED",
    "COUPON_APPLIED",
    "SEARCH_PERFORMED",
    "CAKE_BUILDER_STARTED",
    "CAKE_BUILDER_COMPLETED",
  ]),
  anonymousId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  path: z.string().trim().startsWith("/").max(300),
  metadata: z
    .record(z.string().max(40), metadataValue)
    .refine((value) => Object.keys(value).length <= 8)
    .default({}),
  occurredAt: z.string().datetime(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const limited = await enforcePublicRateLimit(request, { scope: "analytics-event", maximum: 120, windowSeconds: 60 });
  if (limited) return limited;
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid analytics event." }, { status: 400 });
  const now = Date.now();
  const occurredAt = new Date(parsed.data.occurredAt).getTime();
  if (occurredAt > now + 5 * 60_000 || occurredAt < now - 7 * 86_400_000)
    return Response.json({ error: "Invalid analytics timestamp." }, { status: 400 });
  try {
    const { error } = await createServiceClient()
      .from("analytics_events")
      .insert({
        event_name: parsed.data.eventName,
        anonymous_id: parsed.data.anonymousId,
        product_id: parsed.data.productId ?? null,
        path: parsed.data.path,
        metadata: parsed.data.metadata,
        occurred_at: parsed.data.occurredAt,
      });
    if (error) throw error;
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("analytics.event_write_failed", error, { eventName: parsed.data.eventName });
    return Response.json({ error: "Analytics is temporarily unavailable." }, { status: 503 });
  }
}
