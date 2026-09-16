import { NextResponse } from "next/server";
import { isActiveAdmin } from "@/lib/auth/admin-auth";
import { isSameOrigin, verifyOtpSchema } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const parsed = verifyOtpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the six-digit code from your email." }, { status: 400 });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.token,
      type: "email",
    });

    if (error || !data.user) {
      return NextResponse.json({ error: "That code is invalid or has expired." }, { status: 401 });
    }

    if (!(await isActiveAdmin(supabase, data.user.id))) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: "This account is not authorized for admin access." }, { status: 403 });
    }

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Authentication is not configured yet." }, { status: 503 });
  }
}
