import { redirect } from "next/navigation";
import { AdminPortal } from "@/components/admin/admin-portal";
import { requireAdminPageSession } from "@/lib/auth/admin-request";
import { getAdminData } from "@/lib/data/admin";
import { getSiteUrl } from "@/lib/site-url";
export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const session = await requireAdminPageSession();
  if (!session) redirect("/admin/login");
  const { section } = await params;
  const selectedSection = section?.[0] ?? "dashboard";
  const data = await getAdminData(session.db, {
    includeAnalytics: ["dashboard", "analytics"].includes(selectedSection),
  });
  return (
    <AdminPortal
      section={selectedSection}
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
      initialCarousel={data.carousel}
      initialMarketing={data.marketing}
      initialAuditLogs={data.auditLogs}
      initialAnalytics={data.analytics}
      siteUrl={getSiteUrl()}
    />
  );
}
