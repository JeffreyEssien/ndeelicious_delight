import { notFound, redirect } from "next/navigation";
import { BusinessDocument } from "@/components/documents/business-document";
import { requireAdminPageSession } from "@/lib/auth/admin-request";
import { getBusinessSettings } from "@/lib/data/settings";

export default async function Page({ params }: { params: Promise<{ requestNumber: string }> }) {
  const session = await requireAdminPageSession();
  if (!session) redirect("/admin/login");
  const { requestNumber } = await params;
  const [{ data: cake, error }, business] = await Promise.all([
    session.db
      .from("custom_cake_orders")
      .select(
        "request_number,customer_name,email,phone,status,configuration,requested_date,estimated_total,quoted_total,quote_expires_at,customer_note,created_at",
      )
      .eq("request_number", requestNumber)
      .maybeSingle(),
    getBusinessSettings(session.db),
  ]);
  if (error || !cake || !cake.quoted_total) notFound();
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
