import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { AdminIdentity } from "@/lib/auth/admin-request";
import { createServiceClient } from "@/lib/supabase/service";

// Short-lived so a crashed request leaves nothing usable behind; it is revoked as soon as the import finishes.
const SESSION_MINUTES = 5;

function keyMatches(request: Request) {
  const secret = process.env.PRODUCT_IMPORT_API_KEY?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 32) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

const failure = (error: string, status: number) => Response.json({ error }, { status });

function adminEmails() {
  return (process.env.PRODUCT_IMPORT_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

// Server-to-server callers (the Google Form import) cannot hold an admin cookie, so they present
// PRODUCT_IMPORT_API_KEY instead and name the submitting admin in X-Submitted-By. That email must be
// listed in PRODUCT_IMPORT_ADMIN_EMAILS; with a single listed admin the header may be left out.
// Changes are attributed through a throwaway admin session, which keeps the audit trail's
// session requirement intact.
export async function withIntegrationAdmin(request: Request, run: (auth: IntegrationAuth) => Promise<Response>) {
  if (!keyMatches(request)) return failure("Unauthorized.", 401);
  const allowed = adminEmails();
  if (!allowed.length) return failure("Product import is not configured.", 503);
  const submittedBy = request.headers.get("x-submitted-by")?.trim().toLowerCase();
  const email = submittedBy || (allowed.length === 1 ? allowed[0] : "");
  if (!email) return failure("Say which admin is submitting (X-Submitted-By).", 400);
  if (!allowed.includes(email)) return failure(`${email} is not allowed to add products.`, 403);
  let db: ReturnType<typeof createServiceClient>;
  try {
    db = createServiceClient();
  } catch {
    return failure("Product import is not configured.", 503);
  }
  const { data: admin } = await db
    .from("admins")
    .select("id,email,name,role,active")
    .eq("email", email)
    .eq("active", true)
    .maybeSingle();
  if (!admin) return failure(`${email} is not an active admin.`, 403);
  const { data: session, error } = await db
    .from("admin_sessions")
    .insert({
      admin_id: admin.id,
      token_hash: createHash("sha256")
        .update(`integration:${randomBytes(32).toString("hex")}`)
        .digest("hex"),
      expires_at: new Date(Date.now() + SESSION_MINUTES * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error || !session) return failure("Product import could not start. Please try again.", 503);
  try {
    return await run({ db, admin: admin as AdminIdentity, sessionId: session.id });
  } finally {
    await db.from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", session.id);
  }
}

export type IntegrationAuth = {
  db: ReturnType<typeof createServiceClient>;
  admin: AdminIdentity;
  sessionId: string;
};
