export function getSiteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_VERCEL_URL?.trim() || "http://localhost:3000";
  const url =
    configured.startsWith("http://") || configured.startsWith("https://") ? configured : `https://${configured}`;
  return url.replace(/\/$/, "");
}
