export const defaultDocumentLogo = "/brand-logo.jpg";
// Both renderers support local PNG/JPEG and HTTPS assets from the configured storage host.
export function documentLogoUrl(value?: string) {
  if (!value) return defaultDocumentLogo;
  try {
    if (value.startsWith("/") && !value.startsWith("//")) {
      const decoded = decodeURIComponent(value.split("?")[0]);
      if (decoded.includes("\\") || decoded.split("/").includes("..")) return defaultDocumentLogo;
      const path = decodeURIComponent(new URL(value, "https://local.invalid").pathname);
      return !path.split("/").includes("..") && /\.(png|jpe?g)$/i.test(path) ? value : defaultDocumentLogo;
    }
    const url = new URL(value);
    const storage = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (
      url.protocol === "https:" &&
      storage &&
      url.origin === new URL(storage).origin &&
      url.pathname.startsWith("/storage/v1/object/") &&
      /\.(png|jpe?g)$/i.test(url.pathname)
    )
      return value;
  } catch {
    /* Unsupported historical branding uses the shared default. */
  }
  return defaultDocumentLogo;
}
