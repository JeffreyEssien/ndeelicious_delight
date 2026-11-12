import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, readAdminSessionCookie } from "@/lib/auth/admin-session";
import { isOpenWhileLocked, isSiteLocked, lockedResponse } from "@/lib/site-lock";
import { updateSession } from "@/lib/supabase/proxy";

function isSignedInAdmin(request: NextRequest) {
  try {
    return Boolean(readAdminSessionCookie(request.cookies.get(ADMIN_SESSION_COOKIE)?.value));
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return updateSession(request);
  if (isSiteLocked() && !isOpenWhileLocked(pathname) && !isSignedInAdmin(request)) {
    return lockedResponse(pathname);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except Next's build files and files in public/ (anything with an extension),
  // so the "coming soon" page can still load the logo and favicon.
  matcher: ["/((?!_next/static|_next/image|.*\\.[a-zA-Z0-9]+$).*)"],
};
