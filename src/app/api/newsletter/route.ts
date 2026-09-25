import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { emailFrame, sendTransactionalEmail } from "@/lib/email/mailer";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const { error } = await createServiceClient()
    .from("newsletter_subscribers")
    .upsert({ email: parsed.data.email, active: true, unsubscribed_at: null }, { onConflict: "email" });
  if (error) return Response.json({ error: "We couldn’t subscribe you. Please try again." }, { status: 500 });
  await sendTransactionalEmail({
    to: parsed.data.email,
    subject: "Welcome to Ndeeelicious Delight",
    html: emailFrame(
      "You’re on the list",
      "<p>We’ll share fresh bakes, seasonal boxes and special dates with you.</p>",
    ),
  });
  return Response.json({ ok: true }, { status: 201 });
}
