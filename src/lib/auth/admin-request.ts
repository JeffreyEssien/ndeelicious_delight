import { isActiveAdmin } from "@/lib/auth/admin-auth";
import { isSameOrigin } from "@/lib/auth/validation";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminRequest(request: Request) {
  if (!isSameOrigin(request)) {
    return { ok: false as const, response: Response.json({ error: "Invalid request origin." }, { status: 403 }) };
  }
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user || !(await isActiveAdmin(db, data.user.id))) {
    return { ok: false as const, response: Response.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  return { ok: true as const, db, user: data.user };
}
