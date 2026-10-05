/** Build the customer-facing link from the single owner-managed WhatsApp setting. */
export function whatsappUrl(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (raw.startsWith("https://")) {
    try {
      const url = new URL(raw);
      if (url.hostname === "wa.me" && /^\/\d{7,15}$/.test(url.pathname)) return url.toString();
    } catch {
      return "";
    }
    return "";
  }
  const digits = raw.replace(/\D/g, "");
  return /^\d{7,15}$/.test(digits) ? `https://wa.me/${digits}` : "";
}
