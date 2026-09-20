import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, readAdminSessionCookie } from "@/lib/auth/admin-session";

export async function updateSession(request: NextRequest) {
  const loginPath = request.nextUrl.pathname === "/admin/login";
  if (loginPath) return NextResponse.next({ request });
  try {
    if (readAdminSessionCookie(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)) {
      return NextResponse.next({ request });
    }
  } catch {
    return NextResponse.redirect(new URL("/admin/login?error=configuration", request.url));
  }
  return NextResponse.redirect(new URL("/admin/login", request.url));
}
