import { z } from "zod";
import { hashDocumentToken } from "@/lib/documents/tokens";
import { createServiceClient } from "@/lib/supabase/service";

const schema = z.object({ token: z.string().min(32).max(200), response: z.enum(["ACCEPTED", "DECLINED"]) });

export async function POST(request: Request) {
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
