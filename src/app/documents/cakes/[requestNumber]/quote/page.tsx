import { notFound } from "next/navigation";
import { BusinessDocument } from "@/components/documents/business-document";
import { getBusinessSettings } from "@/lib/data/settings";
import { verifyDocumentToken } from "@/lib/documents/tokens";
import { createServiceClient } from "@/lib/supabase/service";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ requestNumber: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { requestNumber } = await params;
  const { token = "" } = await searchParams;
  if (!verifyDocumentToken("quote", requestNumber, token)) notFound();
  const db = createServiceClient();
  const [{ data: cake, error }, business] = await Promise.all([
    db
      .from("custom_cake_orders")
      .select(
        "request_number,customer_name,email,phone,status,configuration,requested_date,quoted_total,quote_expires_at,customer_note,created_at",
      )
      .eq("request_number", requestNumber)
      .maybeSingle(),
    getBusinessSettings(db),
  ]);
  if (error || !cake?.quoted_total) notFound();
  const configuration = cake.configuration as Record<string, string>;
  const detail = [configuration.size, configuration.flavour, configuration.filling, configuration.design]
    .filter(Boolean)
    .join(" · ");
  return (
    <BusinessDocument
      kind="Quote"
      number={`QT-${cake.request_number.replace(/^CK-/, "")}`}
      issuedAt={cake.created_at}
      validUntil={cake.quote_expires_at}
      status={cake.status}
      customer={{ name: cake.customer_name, email: cake.email, phone: cake.phone }}
      lines={[
        {
          id: cake.request_number,
          name: `${configuration.occasion || "Custom"} cake`,
          detail,
          quantity: 1,
          unitPrice: cake.quoted_total,
          total: cake.quoted_total,
        },
      ]}
      subtotal={cake.quoted_total}
      total={cake.quoted_total}
      notes={[
        `Requested fulfilment date: ${cake.requested_date}`,
        ...(cake.customer_note ? [`Customer note: ${cake.customer_note}`] : []),
        "Final design details remain subject to written approval and availability.",
      ]}
      business={business}
    />
  );
}
