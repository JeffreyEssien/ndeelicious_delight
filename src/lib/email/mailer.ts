import nodemailer from "nodemailer";

export type EmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text version; made from the HTML when not given. */
  text?: string;
  replyTo?: string;
};

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

/**
 * A readable plain-text copy of an email. Sending HTML without one is a common spam signal,
 * and some providers quietly drop such mail.
 */
export function htmlToText(html: string) {
  return html
    .replace(/<(head|style|script)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<div[^>]*display:none[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, "").trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|tr|table|li)>/gi, "\n")
    .replace(/<\/td>/gi, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => entities[name])
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character,
  );
}

function smtpConfiguration() {
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  const clientId = process.env.SMTP_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.SMTP_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken = process.env.SMTP_OAUTH_REFRESH_TOKEN?.trim();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim() || user;
  if (!user || !fromEmail || (!password && !(clientId && clientSecret && refreshToken))) return null;

  const port = Number(process.env.SMTP_PORT || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) return null;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  return {
    fromEmail,
    fromName: process.env.SMTP_FROM_NAME?.trim() || "Ndeeelicious Delight",
    transport: {
      host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
      port,
      secure,
      requireTLS: !secure,
      auth:
        clientId && clientSecret && refreshToken
          ? { type: "OAuth2" as const, user, clientId, clientSecret, refreshToken }
          : { user, pass: password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    },
  };
}

export function isMailerConfigured() {
  return smtpConfiguration() !== null;
}

export async function sendTransactionalEmail(input: EmailInput) {
  const configuration = smtpConfiguration();
  if (process.env.NODE_ENV === "test" || !configuration) {
    return { sent: false, reason: "not-configured" as const };
  }

  try {
    const transporter = nodemailer.createTransport(configuration.transport);
    const result = await transporter.sendMail({
      from: { name: configuration.fromName, address: configuration.fromEmail },
      to: input.to,
      replyTo: input.replyTo,
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
    });
    if (!result.accepted?.length || result.rejected?.length) {
      const detail = `rejected by the mail server${result.response ? `: ${result.response}` : ""}`.slice(0, 300);
      console.warn("SMTP delivery failed", detail);
      return { sent: false, reason: "provider-error" as const, detail };
    }
    return { sent: true, id: result.messageId };
  } catch (error) {
    // Keep the server's own words (for example a daily limit or a refused password) so the
    // failure can be read in the order's email history, not just the logs.
    const field = (name: string) =>
      typeof error === "object" && error !== null && name in error
        ? String((error as Record<string, unknown>)[name])
        : "";
    const detail = [field("code"), field("response") || field("message")].filter(Boolean).join(" ").slice(0, 300);
    console.warn("SMTP delivery failed", detail || "unknown");
    return { sent: false, reason: "provider-error" as const, detail: detail || undefined };
  }
}

export type EmailWording = {
  businessName?: string;
  footer?: string;
  /** Brand colour for the header and buttons; the store theme's primary colour where known. */
  accent?: string;
  /** Inbox preview line shown after the subject in most email apps. */
  preheader?: string;
};

const ink = "#241b1e";
const muted = "#6e6669";
const safeColor = (value: string | undefined) => (value && /^#[0-9a-f]{6}$/i.test(value) ? value : "#792f49");

/** A full-width button that survives email clients, including Outlook. */
export function emailButton(href: string, label: string, accent?: string) {
  const color = safeColor(accent);
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:999px;background:${color}"><a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 28px;border-radius:999px;color:#ffffff;font-weight:700;font-size:15px;text-decoration:none">${escapeHtml(label)}</a></td></tr></table>`;
}

// Table layout and inline styles: the only things every email app renders the same way.
export function emailFrame(title: string, body: string, wording: EmailWording = {}) {
  const color = safeColor(wording.accent);
  const name = escapeHtml(wording.businessName ?? "Ndeeelicious Delight");
  const preheader = wording.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(wording.preheader)}</div>`
    : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:0;background:#f6f1ec">${preheader}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1ec;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${ink}"><tr><td align="center"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden"><tr><td style="background:${color};padding:22px 32px;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:0.02em">${name}</td></tr><tr><td style="padding:32px 32px 8px;font-size:16px;line-height:1.6"><h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;color:${ink}">${escapeHtml(title)}</h1>${body}</td></tr><tr><td style="padding:24px 32px 32px;color:${muted};font-size:13px;line-height:1.6;border-top:1px solid #f0e9e4">${escapeHtml(wording.footer ?? "Made with care.")}<br>${name}</td></tr></table></td></tr></table></body></html>`;
}
