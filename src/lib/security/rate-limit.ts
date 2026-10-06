import { fingerprint } from "@/lib/auth/admin-session";
import { logError } from "@/lib/observability/log";
import { createServiceClient } from "@/lib/supabase/service";

export type PublicRateLimitRule = {
  scope: string;
  maximum: number;
  windowSeconds: number;
};

function requesterKey(request: Request) {
  const address =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  const agent = request.headers.get("user-agent")?.trim().slice(0, 300) || "unknown";
  return fingerprint(`public-rate-limit:${address}|${agent}`);
}

function rateLimitResult(data: unknown) {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") return null;
  const record = value as { allowed?: unknown; retry_after?: unknown };
  if (typeof record.allowed !== "boolean" || !Number.isFinite(Number(record.retry_after))) return null;
  return { allowed: record.allowed, retryAfter: Math.max(1, Math.ceil(Number(record.retry_after))) };
}

export async function enforcePublicRateLimit(request: Request, rule: PublicRateLimitRule) {
  try {
    const { data, error } = await createServiceClient().rpc("consume_public_rate_limit", {
      p_scope: rule.scope,
      p_key_hash: requesterKey(request),
      p_window_seconds: rule.windowSeconds,
      p_max_requests: rule.maximum,
    });
    if (error) throw error;
    const result = rateLimitResult(data);
    if (!result) throw new Error("Rate-limit response was invalid.");
    if (result.allowed) return null;
    return Response.json(
      { error: "Too many requests. Please wait before trying again." },
      {
        status: 429,
        headers: { "Retry-After": String(result.retryAfter), "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    logError("public.rate_limit_failed", error, { scope: rule.scope });
    return Response.json(
      { error: "This request is temporarily unavailable. Please try again shortly." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
