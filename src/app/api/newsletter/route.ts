import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";

const schema = z.object({ email: z.string().trim().email().max(200) });
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const { error } = await createServiceClient().from("newsletter_subscribers").upsert(
    { email: parsed.data.email.toLowerCase(), active: true, unsubscribed_at: null }, { onConflict: "email" },
  );
  if (error) return Response.json({ error: "We couldn’t subscribe you. Please try again." }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
}
