import { getBusinessSettings } from "@/lib/data/settings";
import { notFound } from "next/navigation";
import { BusinessDocument } from "@/components/documents/business-document";
import { persistedDocumentToDTO } from "@/lib/documents/dto";
import { resolveAccessToken } from "@/lib/documents/service";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const document = await resolveAccessToken(createServiceClient(), token);
  if (document?.kind !== "RECEIPT") notFound();
  const business = await getBusinessSettings();
  const dto = persistedDocumentToDTO(document);
  return (
    <BusinessDocument
      {...dto}
      business={{ ...dto.business, whatsapp: business.whatsapp }}
      downloadHref={`/api/documents/pdf?token=${encodeURIComponent(token)}`}
    />
  );
}
