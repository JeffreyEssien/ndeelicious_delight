import { signQuoteApproval } from "@/lib/documents/quote-approval";
import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { previewCakeQuote } from "@/lib/documents/service";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const parsed = z
    .object({ quotedTotal: z.number().int().positive().max(1000000000) })
    .safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !parsed.success)
    return Response.json({ error: "Enter a valid quote amount." }, { status: 400 });
  try {
    const { data: cake, error } = await auth.db.from("custom_cake_orders").select("updated_at").eq("id", id).single();
    if (error || !cake) throw new Error("Request unavailable");
    const { data: latest, error: revisionError } = await auth.db
      .from("business_documents")
      .select("revision")
      .eq("cake_order_id", id)
      .eq("kind", "QUOTE")
      .order("revision", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (revisionError) throw revisionError;
    const document = await previewCakeQuote(auth.db, id, parsed.data.quotedTotal);
    return Response.json(
      {
        ...document,
        approvalToken: signQuoteApproval({
          requestId: id,
          quotedTotal: parsed.data.quotedTotal,
          revision: latest?.revision ?? 0,
          updatedAt: cake.updated_at,
          expiresAt: Date.now() + 15 * 60000,
        }),
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch {
    return Response.json(
      { error: "This request could not be previewed. Refresh and check its linked order." },
      { status: 409 },
    );
  }
}
