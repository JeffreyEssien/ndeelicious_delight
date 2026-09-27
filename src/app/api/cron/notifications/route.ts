import { timingSafeEqual } from "node:crypto";
import { sendDailyLowStockDigest, sendDueReviewInvitations } from "@/lib/email/scheduled-notifications";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 16) return false;
  const left = Buffer.from(secret);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const db = createServiceClient();
    const [stock, reviews] = await Promise.all([sendDailyLowStockDigest(db), sendDueReviewInvitations(db)]);
    return Response.json({ ok: true, stock, reviews });
  } catch (error) {
    console.error("Scheduled notification run failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "Scheduled notifications failed." }, { status: 500 });
  }
}
