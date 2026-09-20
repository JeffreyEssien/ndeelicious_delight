import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/admin-session";
import { isSameOrigin } from "@/lib/auth/validation";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const auth = await requireAdminRequest(request);
    if (auth.ok) {
      await auth.db.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", auth.sessionId);
    }
  } catch {
    // A missing or expired session is already signed out from the app's perspective.
  }
  const response = NextResponse.redirect(new URL("/admin/login", request.url), 303);
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
