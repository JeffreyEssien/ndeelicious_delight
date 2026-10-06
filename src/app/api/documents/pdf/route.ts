import { getStorefrontContent } from "@/lib/data/settings";
import { getBusinessSettings } from "@/lib/data/settings";
import { persistedDocumentToDTO } from "@/lib/documents/dto";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import { resolveAccessToken } from "@/lib/documents/service";
import { createServiceClient } from "@/lib/supabase/service";
import { enforcePublicRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = await enforcePublicRateLimit(request, { scope: "document-pdf", maximum: 30, windowSeconds: 60 });
  if (limited) return limited;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const document = await resolveAccessToken(createServiceClient(), token);
  if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
  const business = await getBusinessSettings();
  const dto = persistedDocumentToDTO(document);
  const content = await getStorefrontContent();
  const pdf = renderDocumentPdf({
    ...dto,
    customerText: content.customerText,
    business: { ...dto.business, whatsapp: business.whatsapp },
  });
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
