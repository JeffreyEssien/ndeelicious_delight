import type { BusinessDocumentData } from "@/components/documents/business-document";
import type { BusinessSettings } from "@/types/content";
export type CakeQuoteSource = {
  request_number: string;
  customer_name: string;
  email: string;
  phone: string;
  configuration: Record<string, string>;
  requested_date: string;
  customer_note: string | null;
};
export function cakeQuoteContent(
  cake: CakeQuoteSource,
  business: BusinessSettings,
  amount: number,
  branding: { accentColor: string; logoUrl?: string },
): BusinessDocumentData {
  const configuration = cake.configuration;
  return {
    kind: "Quote",
    number: `${cake.request_number} · Preview`,
    issuedAt: new Date().toISOString(),
    status: "DRAFT — NOT SENT",
    business,
    customer: { name: cake.customer_name, email: cake.email, phone: cake.phone },
    lines: [
      {
        id: cake.request_number,
        name: `${configuration.occasion || "Custom"} cake`,
        detail: [configuration.size, configuration.flavour, configuration.filling, configuration.design]
          .filter(Boolean)
          .join(" · "),
        quantity: 1,
        unitPrice: amount,
        total: amount,
      },
    ],
    subtotal: amount,
    total: amount,
    amountDue: amount,
    ...branding,
    showSku: false,
    notes: [
      `Requested fulfilment date: ${cake.requested_date}`,
      ...(configuration.cakeType
        ? [
            `Cake type: ${configuration.cakeType}`,
            `Minimum lead time at submission: ${configuration.minimumLeadTime || "See request"}`,
          ]
        : []),
      ...(cake.customer_note ? [`Customer note: ${cake.customer_note}`] : []),
      "Final design details remain subject to written approval and availability.",
    ],
  };
}
