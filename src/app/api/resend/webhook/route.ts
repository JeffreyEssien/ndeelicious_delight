import { forwardReceivedEmail, verifyResendWebhook } from "@/lib/email/inbound";
import { logError, logInfo } from "@/lib/observability/log";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });

  const payload = await request.text();
  const verified = verifyResendWebhook(
    payload,
    {
      id: request.headers.get("svix-id"),
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    secret,
  );
  if (!verified) return Response.json({ error: "Invalid webhook signature." }, { status: 400 });

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  if (event.type !== "email.received") return Response.json({ received: true });
  const emailId = event.data?.email_id;
  if (!emailId) return Response.json({ error: "Missing email id." }, { status: 400 });

  try {
    const result = await forwardReceivedEmail(emailId);
    if (!result.forwarded && result.reason === "not-configured") {
      return Response.json({ error: "Forwarding is not configured." }, { status: 503 });
    }
    logInfo("resend.inbound_forwarded", { eventType: event.type });
    return Response.json({ received: true });
  } catch (error) {
    // A 500 makes Resend retry the delivery later.
    logError("resend.inbound_forward_failed", error, { eventType: event.type });
    return Response.json({ error: "Forwarding failed." }, { status: 500 });
  }
}
