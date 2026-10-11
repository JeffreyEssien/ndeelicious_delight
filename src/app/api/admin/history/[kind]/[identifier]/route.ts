import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { getAdminCakeDetails, getAdminOrderDetails } from "@/lib/data/admin";
export async function GET(request: Request, context: { params: Promise<{ kind: string; identifier: string }> }) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { kind, identifier } = await context.params;
  if (kind !== "orders" && kind !== "cakes") return Response.json({ error: "Unknown workspace." }, { status: 404 });
  if (identifier.length > 100 || (kind === "cakes" && !z.uuid().safeParse(identifier).success))
    return Response.json({ error: "Invalid record." }, { status: 400 });
  try {
    const detail =
      kind === "orders"
        ? await getAdminOrderDetails(auth.db, identifier)
        : await getAdminCakeDetails(auth.db, identifier);
    if (!detail) return Response.json({ error: "Record not found." }, { status: 404 });
    return Response.json(detail, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Details could not be loaded. Please retry." }, { status: 503 });
  }
}
