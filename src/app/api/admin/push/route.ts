import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { isPushConfigured, removeSubscription, saveSubscription } from "@/lib/push/send";
import { pushSubscriptionSchema } from "@/lib/push/validation";

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  if (!isPushConfigured()) return Response.json({ error: "Push notifications are not set up." }, { status: 503 });
  const parsed = pushSubscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid subscription." }, { status: 400 });
  try {
    await saveSubscription(auth.db, { audience: "admin", adminId: auth.admin.id }, parsed.data);
  } catch {
    return Response.json({ error: "Push notifications could not be turned on." }, { status: 500 });
  }
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = z
    .object({ endpoint: pushSubscriptionSchema.shape.endpoint })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid subscription." }, { status: 400 });
  await removeSubscription(auth.db, parsed.data.endpoint, auth.admin.id);
  return Response.json({ ok: true });
}
