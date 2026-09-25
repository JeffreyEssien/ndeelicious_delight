import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  createAdminSession,
  fingerprint,
  verifyOtpCode,
} from "@/lib/auth/admin-session";
import { isSameOrigin, verifyOtpSchema } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";

const invalidCode = () =>
  NextResponse.json(
    { error: "That code is invalid or has expired." },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const parsed = verifyOtpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Enter the six-digit code from your email." }, { status: 400 });

  try {
    const db = createServiceClient();
    const now = new Date();
    const { data: challenge, error } = await db
      .from("admin_otp_challenges")
      .select("id,admin_id,code_hash,attempts,max_attempts,expires_at")
      .eq("recipient_hash", fingerprint(parsed.data.email))
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !challenge || !challenge.admin_id) return invalidCode();

    if (new Date(challenge.expires_at).getTime() <= now.getTime() || challenge.attempts >= challenge.max_attempts) {
      await db.from("admin_otp_challenges").update({ consumed_at: now.toISOString() }).eq("id", challenge.id);
      return invalidCode();
    }

    const attempts = challenge.attempts + 1;
    const { data: claimedAttempt } = await db
      .from("admin_otp_challenges")
      .update({ attempts })
      .eq("id", challenge.id)
      .eq("attempts", challenge.attempts)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (!claimedAttempt) return invalidCode();

    if (!verifyOtpCode(challenge.id, parsed.data.token, challenge.code_hash)) {
      if (attempts >= challenge.max_attempts) {
        await db.from("admin_otp_challenges").update({ consumed_at: now.toISOString() }).eq("id", challenge.id);
      }
      return invalidCode();
    }

    const { data: admin } = await db
      .from("admins")
      .select("id")
      .eq("id", challenge.admin_id)
      .eq("active", true)
      .maybeSingle();
    if (!admin) return invalidCode();

    const { data: consumed } = await db
      .from("admin_otp_challenges")
      .update({ consumed_at: now.toISOString() })
      .eq("id", challenge.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (!consumed) return invalidCode();

    const session = createAdminSession(now.getTime());
    const { error: sessionError } = await db.from("admin_sessions").insert({
      admin_id: admin.id,
      token_hash: session.tokenHash,
      expires_at: session.expiresAt.toISOString(),
    });
    if (sessionError) throw sessionError;

    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(ADMIN_SESSION_COOKIE, session.cookieValue, adminSessionCookieOptions(session.expiresAt));
    return response;
  } catch {
    return NextResponse.json(
      { error: "Admin authentication is not configured yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
