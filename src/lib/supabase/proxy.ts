import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isActiveAdmin } from "@/lib/auth/admin-auth";
import { getSupabaseConfig } from "./config";

function redirectWithCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const redirect = NextResponse.redirect(new URL(pathname, request.url));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const loginPath = request.nextUrl.pathname === "/admin/login";

  try {
    const { url, publishableKey } = getSupabaseConfig();
    const supabase = createServerClient(url, publishableKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data } = await supabase.auth.getClaims();
    const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;

    if (!userId) return loginPath ? response : redirectWithCookies(request, response, "/admin/login");

    const authorized = await isActiveAdmin(supabase, userId);
    if (!authorized) {
      await supabase.auth.signOut();
      return redirectWithCookies(request, response, "/admin/login?error=unauthorized");
    }

    return loginPath ? redirectWithCookies(request, response, "/admin") : response;
  } catch {
    return loginPath ? response : redirectWithCookies(request, response, "/admin/login?error=configuration");
  }
}
