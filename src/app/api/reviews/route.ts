import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { readReviewToken } from "@/lib/reviews/invitations";

const schema = z.object({
  token: z.string().min(40).max(300),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(10).max(2000),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Please complete every review field." }, { status: 400 });
  const invitationId = readReviewToken(parsed.data.token);
  if (!invitationId) return Response.json({ error: "This review link is invalid." }, { status: 401 });
  try {
    const db = createServiceClient();
    const { error } = await db.rpc("submit_verified_review", {
      p_invitation_id: invitationId,
      p_rating: parsed.data.rating,
      p_title: parsed.data.title,
      p_body: parsed.data.body,
    });
    if (error) throw error;
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
    if (message.includes("INVITATION_USED"))
      return Response.json({ error: "This review link has already been used." }, { status: 409 });
    if (message.includes("INVITATION_UNAVAILABLE") || message.includes("ORDER_NOT_DELIVERED"))
      return Response.json({ error: "This review link is not available." }, { status: 410 });
    return Response.json({ error: "We couldn’t save your review. Please try again." }, { status: 500 });
  }
}
