import { notFound } from "next/navigation";
import { BusinessDocument } from "@/components/documents/business-document";
import { getBusinessSettings } from "@/lib/data/settings";
import { verifyDocumentToken } from "@/lib/documents/tokens";
import { createServiceClient } from "@/lib/supabase/service";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { orderNumber } = await params;
  const { token = "" } = await searchParams;
  if (!verifyDocumentToken("receipt", orderNumber, token)) notFound();
  const db = createServiceClient();
  const [{ data: order, error }, business] = await Promise.all([
    db
      .from("orders")
      .select(
        "order_number,customer_name,email,phone,status,fulfilment,delivery_address_snapshot,subtotal,discount_total,delivery_fee,tax_total,grand_total,created_at,customer_note,order_items(id,product_name,variant_name,sku,unit_price,quantity,final_price),payments(status,amount,refunded_amount,paid_at)",
      )
      .eq("order_number", orderNumber)
      .maybeSingle(),
    getBusinessSettings(db),
  ]);
  if (error || !order) notFound();
  const payment = [...(order.payments ?? [])].sort((a, b) =>
    String(b.paid_at ?? "").localeCompare(String(a.paid_at ?? "")),
  )[0];
  if (!payment?.paid_at) notFound();
  const address = order.delivery_address_snapshot as Record<string, string> | null;
  return (
    <BusinessDocument
      kind="Receipt"
      number={`RCT-${order.order_number.replace(/^ND-/, "")}`}
      issuedAt={payment.paid_at}
      status={payment.status}
      customer={{
        name: order.customer_name,
        email: order.email,
        phone: order.phone,
        address: address
          ? [address.street, address.addressLine2, address.city, address.province, address.postalCode]
              .filter(Boolean)
              .join(", ")
          : undefined,
      }}
      lines={(order.order_items ?? []).map((line) => ({
        id: line.id,
        name: line.product_name,
        detail: line.variant_name ?? "Standard",
        sku: line.sku ?? undefined,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        total: line.final_price,
      }))}
      subtotal={order.subtotal}
      discount={order.discount_total}
      delivery={order.delivery_fee}
      tax={order.tax_total}
      total={order.grand_total}
      paid={payment.amount}
      refunded={payment.refunded_amount}
      notes={[order.fulfilment === "pickup" ? "Fulfilment: Bakery pickup" : "Fulfilment: Delivery"]}
      business={business}
    />
  );
}
