import { redirect } from "next/navigation";
import { AdminPortal } from "@/components/admin/admin-portal";
import { requireAdminPageSession } from "@/lib/auth/admin-request";
import { getAdminData } from "@/lib/data/admin";
export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const session = await requireAdminPageSession();
  if (!session) redirect("/admin/login");
  const [{ section }, data] = await Promise.all([params, getAdminData(session.db)]);
  return (
    <AdminPortal
      section={section?.[0] ?? "dashboard"}
      initialProducts={data.products}
      initialOrders={data.orders}
      initialZones={data.zones}
      initialCakes={data.cakes}
      initialCoupons={data.coupons}
      initialCategories={data.categories}
      initialReviews={data.reviews}
      initialContent={data.content}
      initialBusiness={data.business}
      initialCakeConfiguration={data.cakeConfiguration}
      initialAppearance={data.appearance}
      initialAuditLogs={data.auditLogs}
    />
  );
}
