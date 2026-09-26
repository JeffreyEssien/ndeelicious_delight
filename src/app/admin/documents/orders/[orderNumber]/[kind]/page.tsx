import { notFound, redirect } from "next/navigation";
import { DocumentComposer } from "@/components/documents/document-composer";
import { requireAdminPageSession } from "@/lib/auth/admin-request";
import { getBusinessSettings } from "@/lib/data/settings";

export default async function Page({ params }: { params: Promise<{ orderNumber: string; kind: string }> }) {
  const session = await requireAdminPageSession();
  if (!session) redirect("/admin/login");
  const { orderNumber, kind } = await params;
  if (!["invoice", "receipt"].includes(kind)) notFound();
  const [{ data: order, error }, business] = await Promise.all([
    session.db
      .from("orders")
      .select(
        "order_number,customer_name,email,phone,status,fulfilment,delivery_address_snapshot,subtotal,discount_total,delivery_fee,tax_total,grand_total,currency,created_at,customer_note,order_items(id,product_name,variant_name,sku,unit_price,quantity,final_price),payments(status,amount,refunded_amount,paid_at)",
      )
      .eq("order_number", orderNumber)
      .maybeSingle(),
    getBusinessSettings(session.db),
  ]);
  if (error || !order) notFound();
  const payment = [...(order.payments ?? [])].sort((a, b) =>
    String(b.paid_at ?? "").localeCompare(String(a.paid_at ?? "")),
  )[0];
  if (kind === "receipt" && !payment?.paid_at) notFound();
  const address = order.delivery_address_snapshot as Record<string, string> | null;
  return (
    <DocumentComposer
      initial={{
        kind: kind === "receipt" ? "Receipt" : "Invoice",
        number: `${kind === "receipt" ? "RCT" : "INV"}-${order.order_number.replace(/^ND-/, "")}`,
        issuedAt: kind === "receipt" ? payment.paid_at : order.created_at,
        status: kind === "receipt" ? payment.status : order.status,
        customer: {
          name: order.customer_name,
          email: order.email,
          phone: order.phone,
          address: address
            ? [address.street, address.addressLine2, address.city, address.province, address.postalCode]
                .filter(Boolean)
                .join(", ")
            : undefined,
        },
        lines: (order.order_items ?? []).map((line) => ({
          id: line.id,
          name: line.product_name,
          detail: line.variant_name ?? "Standard",
          sku: line.sku ?? undefined,
          quantity: line.quantity,
          unitPrice: line.unit_price,
          total: line.final_price,
        })),
        subtotal: order.subtotal,
        discount: order.discount_total,
        delivery: order.delivery_fee,
        tax: order.tax_total,
        total: order.grand_total,
        paid: kind === "receipt" ? payment.amount : undefined,
        refunded: kind === "receipt" ? payment.refunded_amount : undefined,
        notes: [
          order.fulfilment === "pickup" ? "Fulfilment: Bakery pickup" : "Fulfilment: Delivery",
          ...(order.customer_note ? [`Customer note: ${order.customer_note}`] : []),
        ],
        business,
        design: "classic",
        accentColor: "#792f49",
        showSku: true,
        showBusinessTaxNumber: true,
        showPaymentDetails: true,
      }}
    />
  );
}
