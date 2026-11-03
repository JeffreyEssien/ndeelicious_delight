import { createHmac, timingSafeEqual } from "node:crypto";
import { type EmailAttachment, escapeHtml, sendTransactionalEmail } from "./mailer";

const resendApi = "https://api.resend.com";
const signatureToleranceSeconds = 5 * 60;
// Gmail rejects messages over 25 MB, and base64 encoding adds about a third.
const maximumAttachmentBytes = 18 * 1024 * 1024;

type WebhookHeaders = { id: string | null; timestamp: string | null; signature: string | null };

/** Verifies a Resend (Svix) webhook signature against the raw request body. */
export function verifyResendWebhook(
  payload: string,
  headers: WebhookHeaders,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(nowSeconds - sentAt) > signatureToleranceSeconds) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${payload}`).digest();
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const received = Buffer.from(value, "base64");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

type ReceivedEmail = {
  from: string;
  subject: string | null;
  html: string | null;
  text: string | null;
  headers: Record<string, string> | null;
};

type ReceivedAttachment = {
  filename: string | null;
  size: number;
  content_type: string | null;
  content_id: string | null;
  download_url: string;
};

async function resendGet<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${resendApi}${path}`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!response.ok) throw new Error(`Resend request failed with ${response.status}`);
  return (await response.json()) as T;
}

async function downloadAttachments(emailId: string, apiKey: string) {
  const { data } = await resendGet<{ data: ReceivedAttachment[] }>(
    `/emails/receiving/${encodeURIComponent(emailId)}/attachments`,
    apiKey,
  );
  const attachments: EmailAttachment[] = [];
  const skipped: string[] = [];
  let total = 0;
  for (const attachment of data ?? []) {
    const filename = attachment.filename || "attachment";
    if (total + attachment.size > maximumAttachmentBytes) {
      skipped.push(filename);
      continue;
    }
    const response = await fetch(attachment.download_url);
    if (!response.ok) throw new Error(`Attachment download failed with ${response.status}`);
    total += attachment.size;
    attachments.push({
      filename,
      content: Buffer.from(await response.arrayBuffer()),
      contentType: attachment.content_type ?? undefined,
      cid: attachment.content_id?.replace(/^<|>$/g, "") || undefined,
    });
  }
  return { attachments, skipped };
}

/**
 * Fetches an email received by Resend and forwards it to the owner's inbox.
 * Reply-To is the original sender, so replying in Gmail answers the customer.
 */
export async function forwardReceivedEmail(emailId: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const forwardTo = (process.env.INBOUND_FORWARD_TO || process.env.ADMIN_EMAIL)?.trim();
  if (!apiKey || !forwardTo) return { forwarded: false, reason: "not-configured" as const };

  const email = await resendGet<ReceivedEmail>(
    `/emails/receiving/${encodeURIComponent(emailId)}?html_format=cid`,
    apiKey,
  );
  const sender = email.headers?.from || email.from;
  const ownAddress = process.env.SMTP_FROM_EMAIL?.trim().toLowerCase();
  if (ownAddress && email.from.toLowerCase() === ownAddress) {
    return { forwarded: false, reason: "own-address" as const };
  }

  const { attachments, skipped } = await downloadAttachments(emailId, apiKey);
  const notice = skipped.length
    ? `<br>Too large to forward (open in Resend to download): ${skipped.map(escapeHtml).join(", ")}`
    : "";
  const banner = `<div style="font-family:Arial,sans-serif;font-size:13px;color:#6e6669;border-bottom:1px solid #eee;padding-bottom:8px;margin-bottom:16px">Received from <b>${escapeHtml(sender)}</b>. Reply to this email to answer them.${notice}</div>`;
  const body =
    email.html ?? `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(email.text ?? "")}</pre>`;

  const result = await sendTransactionalEmail({
    to: forwardTo,
    replyTo: sender,
    subject: email.subject?.trim() || "(no subject)",
    html: `${banner}${body}`,
    text: email.text ? `Received from ${sender}. Reply to this email to answer them.\n\n${email.text}` : undefined,
    attachments,
  });
  if (!result.sent) throw new Error(`Forward failed: ${result.reason}`);
  return { forwarded: true as const };
}
