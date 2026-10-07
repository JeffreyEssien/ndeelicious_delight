export function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_VERCEL_URL?.trim() ||
    (process.env.NODE_ENV === "production" ? "https://www.ndeelicious.com" : "http://localhost:3000");
  const url =
    configured.startsWith("http://") || configured.startsWith("https://") ? configured : `https://${configured}`;
  return url.replace(/\/$/, "");
}
