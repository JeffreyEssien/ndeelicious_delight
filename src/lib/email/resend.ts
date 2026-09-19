type EmailInput = {
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

export async function sendTransactionalEmail(input: EmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.SMTP_FROM_EMAIL?.trim();
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "Ndeeelicious Delight";
  if (process.env.NODE_ENV === "test" || !apiKey || !fromEmail) {
    return { sent: false, reason: "not-configured" as const };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        html: input.html,
        reply_to: input.replyTo,
      }),
    });
    if (!response.ok) {
      console.warn("Resend delivery failed", response.status);
      return { sent: false, reason: "provider-error" as const };
    }
    const body: unknown = await response.json();
    const id = typeof body === "object" && body !== null && "id" in body && typeof body.id === "string"
      ? body.id
      : undefined;
    return { sent: true, id };
  } catch (error) {
    console.warn("Resend request failed", error instanceof Error ? error.message : "Unknown error");
    return { sent: false, reason: "network-error" as const };
  }
}

export function emailFrame(title: string, body: string) {
  return `<div style="background:#faf8f5;padding:32px;font-family:Arial,sans-serif;color:#241b1e"><div style="max-width:600px;margin:auto;background:#fff;padding:32px;border-radius:16px"><p style="color:#792f49;font-weight:700">Ndeeelicious Delight</p><h1 style="font-size:26px">${escapeHtml(title)}</h1>${body}<p style="margin-top:32px;color:#6e6669;font-size:13px">Made with care in Lagos.</p></div></div>`;
}
