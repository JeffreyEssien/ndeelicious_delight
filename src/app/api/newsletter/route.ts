import { getCustomerEmailText } from "@/lib/customer-text";
import { z } from "zod";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { emailFrame, escapeHtml, sendTransactionalEmail } from "@/lib/email/mailer";
import { enforcePublicRateLimit } from "@/lib/security/rate-limit";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const limited = await enforcePublicRateLimit(request, { scope: "newsletter", maximum: 5, windowSeconds: 3600 });
  if (limited) return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  const { error } = await createServiceClient()
    .from("newsletter_subscribers")
    .upsert({ email: parsed.data.email, active: true, unsubscribed_at: null }, { onConflict: "email" });
  if (error) return Response.json({ error: "We couldn’t subscribe you. Please try again." }, { status: 500 });
  const { t, frame } = await getCustomerEmailText();
  await sendTransactionalEmail({
    to: parsed.data.email,
    subject: t("Welcome to {business}", { business: frame.businessName }),
    html: emailFrame(
      t("You’re on the list"),
      `<p>${escapeHtml(t("We’ll share fresh bakes, seasonal boxes and special dates with you."))}</p>`,
      frame,
    ),
  });
  return Response.json({ ok: true }, { status: 201 });
}
