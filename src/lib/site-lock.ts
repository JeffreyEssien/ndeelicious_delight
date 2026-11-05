// Pre-launch lock: with SITE_LOCKED=true the customer site shows a "coming soon" page while the
// admin keeps working. A signed-in admin still sees the whole site, so the owner can check it.

export function isSiteLocked(value = process.env.SITE_LOCKED) {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

// Paths that must keep working for visitors who are not signed in to the admin:
// the admin itself and its sign-in, plus calls made by Stripe, Resend, the cron job and Google Forms.
const OPEN_PATHS = [
  /^\/admin(?:\/|$)/,
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/auth\/admin(?:\/|$)/,
  /^\/api\/stripe\/webhook(?:\/|$)/,
  /^\/api\/resend\/webhook(?:\/|$)/,
  /^\/api\/cron(?:\/|$)/,
  /^\/api\/integrations(?:\/|$)/,
  /^\/(?:robots\.txt|manifest\.webmanifest|sw\.js)$/,
];

export function isOpenWhileLocked(pathname: string) {
  return OPEN_PATHS.some((pattern) => pattern.test(pathname));
}

const RETRY_AFTER_SECONDS = "3600";

export function lockedResponse(pathname: string) {
  const headers = {
    "Retry-After": RETRY_AFTER_SECONDS,
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  };
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "The shop is not open yet. Please check back soon." }, { status: 503, headers });
  }
  return new Response(COMING_SOON_HTML, {
    status: 503,
    headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
  });
}

const COMING_SOON_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ndeelicious — Opening soon</title>
<link rel="icon" href="/favicon.ico">
<style>
  :root { color-scheme: light dark; --bg: #fbf6f0; --ink: #2b1d16; --muted: #6f5a4d; --ring: #e6d6c6; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1512; --ink: #f6ece3; --muted: #c4b0a2; --ring: #3a2c25; } }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body { display: grid; place-items: center; padding: 24px 16px; background: var(--bg); color: var(--ink);
    font: 16px/1.6 Georgia, "Times New Roman", serif; text-align: center; }
  main { max-width: 32rem; }
  img { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 3px solid var(--ring); }
  h1 { font-size: clamp(1.8rem, 6vw, 2.6rem); line-height: 1.15; margin: 20px 0 8px; font-weight: 600; }
  p { color: var(--muted); margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
</style>
</head>
<body>
<main>
  <img src="/brand-logo.jpg" alt="Ndeelicious">
  <h1>Something delicious is on its way</h1>
  <p>We're putting the finishing touches on our shop. Please check back soon.</p>
</main>
</body>
</html>`;
