import { NextResponse } from "next/server";
import { consumeOtpAttempt } from "@/lib/auth/rate-limit";
import { isSameOrigin, requestOtpSchema } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

const genericMessage = "If this address is an active admin account, a six-digit code is on its way.";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const parsed = requestOtpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const attempt = consumeOtpAttempt(`${forwardedFor}:${parsed.data.email}`);
  if (!attempt.allowed) {
    return NextResponse.json(
      { error: "Too many code requests. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(attempt.retryAfter), "Cache-Control": "no-store" } },
    );
  }

  try {
    const supabase = await createClient();
    await supabase.auth.signInWithOtp({
      email: parsed.data.email,
      options: { shouldCreateUser: false },
    });
    return NextResponse.json({ ok: true, message: genericMessage }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Authentication is not configured yet." }, { status: 503 });
  }
}
