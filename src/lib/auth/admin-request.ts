import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, readAdminSessionCookie } from "@/lib/auth/admin-session";
import { isSameOrigin } from "@/lib/auth/validation";
import { createServiceClient } from "@/lib/supabase/service";

export type AdminIdentity = {
  id: string;
  email: string;
  name: string;
  role: string;
};

function cookieValue(request: Request, name: string) {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

export async function validateAdminSession(value: string | undefined) {
  const signedSession = readAdminSessionCookie(value);
  if (!signedSession) return null;

  const db = createServiceClient();
  const now = new Date().toISOString();
  const { data: session } = await db
    .from("admin_sessions")
    .select("id,admin_id,expires_at")
    .eq("token_hash", signedSession.tokenHash)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();
  if (!session) return null;

  const { data: admin } = await db
    .from("admins")
    .select("id,email,name,role,active")
    .eq("id", session.admin_id)
    .eq("active", true)
    .maybeSingle();
  if (!admin) return null;

  await db.from("admin_sessions").update({ last_seen_at: now }).eq("id", session.id);
  return { db, admin: admin as AdminIdentity, sessionId: session.id };
}

export async function requireAdminRequest(request: Request) {
  if (!isSameOrigin(request)) {
    return { ok: false as const, response: Response.json({ error: "Invalid request origin." }, { status: 403 }) };
  }
  try {
    const session = await validateAdminSession(cookieValue(request, ADMIN_SESSION_COOKIE));
    if (!session) {
      return { ok: false as const, response: Response.json({ error: "Unauthorized." }, { status: 401 }) };
    }
    return { ok: true as const, ...session };
  } catch {
    return {
      ok: false as const,
      response: Response.json({ error: "Admin authentication is not configured." }, { status: 503 }),
    };
  }
}

export async function requireAdminPageSession() {
  const store = await cookies();
  return validateAdminSession(store.get(ADMIN_SESSION_COOKIE)?.value);
}
