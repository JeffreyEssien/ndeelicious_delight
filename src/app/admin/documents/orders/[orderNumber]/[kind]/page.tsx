import { notFound, redirect } from "next/navigation";
import { DocumentComposer } from "@/components/documents/document-composer";
import { requireAdminPageSession } from "@/lib/auth/admin-request";
import { persistedDocumentToDTO } from "@/lib/documents/dto";
import { issueOrderDocument, latestDocument } from "@/lib/documents/service";

export default async function Page({ params }: { params: Promise<{ orderNumber: string; kind: string }> }) {
  const session = await requireAdminPageSession();
  if (!session) redirect("/admin/login");
  const { orderNumber, kind } = await params;
  if (!["invoice", "receipt"].includes(kind)) notFound();
  const { data: order, error } = await session.db
    .from("orders")
    .select("id")
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error || !order) notFound();
  const documentKind = kind === "receipt" ? "RECEIPT" : "INVOICE";
  let document = await latestDocument(session.db, documentKind, "order_id", order.id);
  if (!document) {
    try {
      document = (await issueOrderDocument(session.db, orderNumber, documentKind, session.admin.id)).document;
    } catch {
      notFound();
    }
  }
  return <DocumentComposer initial={persistedDocumentToDTO(document)} />;
}
