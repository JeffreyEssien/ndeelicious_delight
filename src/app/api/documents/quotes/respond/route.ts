import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { hashDocumentToken } from "@/lib/documents/tokens";
import { enforcePublicRateLimit } from "@/lib/security/rate-limit";
import { createServiceClient } from "@/lib/supabase/service";

const schema = z.object({ token: z.string().min(32).max(200), response: z.enum(["ACCEPTED", "DECLINED"]) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const limited = await enforcePublicRateLimit(request, { scope: "quote-response", maximum: 10, windowSeconds: 3600 });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "This quote link is not valid." }, { status: 400 });
  const { data, error } = await createServiceClient().rpc("respond_to_quote", {
    p_token_hash: hashDocumentToken(parsed.data.token),
    p_response: parsed.data.response,
  });
  if (error) {
    const unavailable = ["QUOTE_NOT_AVAILABLE", "QUOTE_ALREADY_RESPONDED"].some((code) => error.message.includes(code));
    return Response.json(
      {
        error: unavailable
          ? "This quote is no longer available. Please ask us for an updated quote."
          : "Response failed.",
      },
      { status: unavailable ? 409 : 500 },
    );
  }
  return Response.json({ state: data.state });
}
