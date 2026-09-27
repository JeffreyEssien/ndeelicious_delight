import { requireAdminRequest } from "@/lib/auth/admin-request";
import type { PersistedDocument } from "@/lib/documents/dto";
import { persistedDocumentToDTO } from "@/lib/documents/dto";
import { renderDocumentPdf } from "@/lib/documents/pdf";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { data, error } = await auth.db
    .from("business_documents")
    .select(
      "id,order_id,cake_order_id,kind,number,revision,state,issued_at,valid_until,due_at,business_snapshot,customer_snapshot,line_items_snapshot,totals_snapshot,branding_snapshot,presentation_snapshot",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return Response.json({ error: "Document not found." }, { status: 404 });
  const document = data as PersistedDocument;
  return new Response(renderDocumentPdf(persistedDocumentToDTO(document)), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${document.number}.pdf"`,
      "cache-control": "private, no-store, max-age=0",
    },
  });
}
