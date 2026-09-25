import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fingerprint, generateOtpCode, hashOtpCode, OTP_MAX_ATTEMPTS, OTP_TTL_MS } from "@/lib/auth/admin-session";
import { isSameOrigin, requestOtpSchema } from "@/lib/auth/validation";
import { emailFrame, escapeHtml, isMailerConfigured, sendTransactionalEmail } from "@/lib/email/mailer";
import { createServiceClient } from "@/lib/supabase/service";

const genericMessage = "If this address is an active admin account, a six-digit code is on its way.";
const rateLimitWindowMs = 15 * 60_000;
const rateLimitMaximum = 5;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const parsed = requestOtpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  try {
    if (!isMailerConfigured()) throw new Error("SMTP is not configured.");

    const db = createServiceClient();
    const now = new Date();
    const recipientHash = fingerprint(parsed.data.email);
    const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const requestFingerprint = fingerprint(`${forwardedFor}|${request.headers.get("user-agent") ?? "unknown"}`);
    const since = new Date(now.getTime() - rateLimitWindowMs).toISOString();
    const [recipientRate, fingerprintRate] = await Promise.all([
      db
        .from("admin_otp_challenges")
        .select("id", { count: "exact", head: true })
        .eq("recipient_hash", recipientHash)
        .gte("created_at", since),
      db
        .from("admin_otp_challenges")
        .select("id", { count: "exact", head: true })
        .eq("request_fingerprint", requestFingerprint)
        .gte("created_at", since),
    ]);
    if (recipientRate.error || fingerprintRate.error) throw new Error("Could not check OTP rate limit.");
    if ((recipientRate.count ?? 0) >= rateLimitMaximum || (fingerprintRate.count ?? 0) >= rateLimitMaximum) {
      return NextResponse.json(
        { error: "Too many code requests. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": "900", "Cache-Control": "no-store" } },
      );
    }

    const { data: admin, error: adminError } = await db
      .from("admins")
      .select("id,email,name")
      .eq("email", parsed.data.email)
      .eq("active", true)
      .maybeSingle();
    if (adminError) throw adminError;

    const { error: invalidationError } = await db
      .from("admin_otp_challenges")
      .update({ consumed_at: now.toISOString() })
      .eq("recipient_hash", recipientHash)
      .is("consumed_at", null);
    if (invalidationError) throw invalidationError;

    const challengeId = randomUUID();
    const code = generateOtpCode();
    const { error: challengeError } = await db.from("admin_otp_challenges").insert({
      id: challengeId,
      admin_id: admin?.id ?? null,
      recipient_hash: recipientHash,
      request_fingerprint: requestFingerprint,
      code_hash: hashOtpCode(challengeId, code),
      max_attempts: OTP_MAX_ATTEMPTS,
      expires_at: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
    });
    if (challengeError) throw challengeError;

    if (admin) {
      const delivery = await sendTransactionalEmail({
        to: admin.email,
        subject: "Your Ndeeelicious admin login code",
        html: emailFrame(
          "Your admin login code",
          `<p>Hello ${escapeHtml(admin.name)},</p><p>Use this code to sign in:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes and can only be used once. If you did not request it, you can ignore this email.</p>`,
        ),
      });
      if (!delivery.sent) {
        const { error: consumeError } = await db
          .from("admin_otp_challenges")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", challengeId);
        if (consumeError) throw consumeError;
      }
    }

    return NextResponse.json({ ok: true, message: genericMessage }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(
      { error: "Admin email authentication is not configured yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
