import { notFound, redirect } from "next/navigation";
import { DocumentComposer } from "@/components/documents/document-composer";
import { requireAdminPageSession } from "@/lib/auth/admin-request";
import { persistedDocumentToDTO } from "@/lib/documents/dto";
import { latestDocument } from "@/lib/documents/service";

export default async function Page({ params }: { params: Promise<{ requestNumber: string }> }) {
  const session = await requireAdminPageSession();
  if (!session) redirect("/admin/login");
  const { requestNumber } = await params;
  const { data: cake, error } = await session.db
    .from("custom_cake_orders")
    .select("id")
    .eq("request_number", requestNumber)
    .maybeSingle();
  if (error || !cake) notFound();
  const document = await latestDocument(session.db, "QUOTE", "cake_order_id", cake.id);
  if (!document) notFound();
  return <DocumentComposer initial={persistedDocumentToDTO(document)} />;
}
