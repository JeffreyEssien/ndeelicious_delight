/** Fail closed before a browser can use staging credentials or mutate fixtures. */
export function validateBrowserEnvironment(env: Record<string, string | undefined>) {
  const target = new URL(env.PLAYWRIGHT_BASE_URL || "http://localhost:3000");
  if (!["http:", "https:"].includes(target.protocol) || target.username || target.password) {
    throw new Error("Browser target must be an HTTP(S) origin without credentials.");
  }
  if (target.pathname !== "/" || target.search || target.hash) {
    throw new Error("PLAYWRIGHT_BASE_URL must contain only an origin.");
  }
  const privileged = Boolean(
    env.PLAYWRIGHT_ADMIN_STORAGE_STATE || env.PLAYWRIGHT_QUOTE_RESPONSE_PATH || env.PLAYWRIGHT_DOCUMENT_PATH,
  );
  if ((env.PLAYWRIGHT_BASE_URL || privileged) && env.PLAYWRIGHT_ISOLATED_ENVIRONMENT !== "true") {
    throw new Error(
      "Confirm isolated Supabase, Stripe test mode and a mail sink with PLAYWRIGHT_ISOLATED_ENVIRONMENT=true.",
    );
  }
  if (env.PLAYWRIGHT_BASE_URL && env.NEXT_PUBLIC_SITE_URL) {
    const canonical = new URL(env.NEXT_PUBLIC_SITE_URL);
    if (target.origin === canonical.origin && !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)) {
      throw new Error("Browser tests cannot target the configured production canonical origin.");
    }
  }
  for (const name of ["PLAYWRIGHT_QUOTE_RESPONSE_PATH", "PLAYWRIGHT_DOCUMENT_PATH"]) {
    const path = env[name];
    if (path && (!path.startsWith("/") || path.startsWith("//") || new URL(path, target).origin !== target.origin)) {
      throw new Error(`${name} must be a relative path on the isolated target.`);
    }
  }
}
