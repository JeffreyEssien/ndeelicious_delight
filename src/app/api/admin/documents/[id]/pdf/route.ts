import { getStorefrontContent } from "@/lib/data/settings";
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
  const content = await getStorefrontContent(auth.db);
  let pdf: Uint8Array;
  try {
    pdf = new Uint8Array(
      await renderDocumentPdf({ ...persistedDocumentToDTO(document), customerText: content.customerText }),
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.message.startsWith("PDF font does not support")
            ? error.message
            : "PDF could not be generated. Use the print view or retry.",
      },
      { status: 422 },
    );
  }
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${document.number}.pdf"`,
      "cache-control": "private, no-store, max-age=0",
    },
  });
}
