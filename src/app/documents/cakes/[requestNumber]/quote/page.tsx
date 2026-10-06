import { getBusinessSettings } from "@/lib/data/settings";
import { notFound } from "next/navigation";
import { BusinessDocument } from "@/components/documents/business-document";
import { QuoteResponse } from "@/components/documents/quote-response";
import { persistedDocumentToDTO } from "@/lib/documents/dto";
import { resolveAccessToken } from "@/lib/documents/service";
import { createServiceClient } from "@/lib/supabase/service";
import { getDeliveryZones } from "@/lib/data/catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const db = createServiceClient();
  const document = await resolveAccessToken(db, token);
  if (document?.kind !== "QUOTE") notFound();
  const [zones, business] = await Promise.all([getDeliveryZones(db), getBusinessSettings(db)]);
  const dto = persistedDocumentToDTO(document);
  const expired = !!document.valid_until && new Date(document.valid_until).getTime() <= Date.now();
  return (
    <>
      <BusinessDocument
        {...dto}
        business={{ ...dto.business, whatsapp: business.whatsapp }}
        downloadHref={`/api/documents/pdf?token=${encodeURIComponent(token)}`}
      />
      <QuoteResponse
        token={token}
        initialState={expired ? "EXPIRED" : document.state}
        contactEmail={business.contactEmail}
        quoteNumber={document.number}
        zones={zones.map((zone) => ({ id: zone.id, name: zone.name, fee: zone.fee, minimumOrder: zone.minimumOrder }))}
        deliveryEnabled={business.deliveryEnabled}
        pickupEnabled={business.pickupEnabled}
        currency={document.business_snapshot.currency}
        locale={document.business_snapshot.locale}
      />
    </>
  );
}
