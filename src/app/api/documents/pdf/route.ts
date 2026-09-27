import { persistedDocumentToDTO } from "@/lib/documents/dto";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { resolveAccessToken } from "@/lib/documents/service";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const document = await resolveAccessToken(createServiceClient(), token);
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  const pdf = renderDocumentPdf(persistedDocumentToDTO(document));
  return new Response(pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${document.number}.pdf"`,
      "cache-control": "private, no-store, max-age=0",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow, noarchive",
    },
  });
}
