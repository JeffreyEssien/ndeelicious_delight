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
  // Remember the page that was asked for so login can return there.
  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}
