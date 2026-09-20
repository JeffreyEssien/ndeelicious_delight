import nodemailer from "nodemailer";

export type EmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
};

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
    });
    return { sent: true, id: result.messageId };
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "unknown";
    console.warn("SMTP delivery failed", code);
    return { sent: false, reason: "provider-error" as const };
  }
}

export function emailFrame(title: string, body: string) {
  return `<div style="background:#faf8f5;padding:32px;font-family:Arial,sans-serif;color:#241b1e"><div style="max-width:600px;margin:auto;background:#fff;padding:32px;border-radius:16px"><p style="color:#792f49;font-weight:700">Ndeeelicious Delight</p><h1 style="font-size:26px">${escapeHtml(title)}</h1>${body}<p style="margin-top:32px;color:#6e6669;font-size:13px">Made with care in Lagos.</p></div></div>`;
}
