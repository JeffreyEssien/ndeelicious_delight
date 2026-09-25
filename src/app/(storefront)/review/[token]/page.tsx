import { notFound } from "next/navigation";
import { VerifiedReviewForm } from "@/components/reviews/verified-review-form";
import { readReviewToken } from "@/lib/reviews/invitations";
import { createServiceClient } from "@/lib/supabase/service";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitationId = readReviewToken(token);
  if (!invitationId) notFound();
  const { data } = await createServiceClient()
    .from("review_invitations")
    .select("eligible_at,expires_at,sent_at,used_at,products(name),orders(status)")
    .eq("id", invitationId)
    .maybeSingle();
  const product = Array.isArray(data?.products) ? data.products[0] : data?.products;
  const order = Array.isArray(data?.orders) ? data.orders[0] : data?.orders;
  const available =
    data?.sent_at &&
    !data.used_at &&
    order?.status === "DELIVERED" &&
    new Date(data.eligible_at) <= new Date() &&
    new Date(data.expires_at) > new Date();
  return (
    <main className="review-invite-page site-container">
      {available ? (
        <VerifiedReviewForm token={token} productName={product?.name ?? "purchase"} />
      ) : (
        <div className="review-invite-card">
          <span className="overline">Review invitation</span>
          <h1>This link is no longer available.</h1>
          <p>
            Review links are single-use and expire after 90 days. Contact the bakery if you believe this is a mistake.
          </p>
        </div>
      )}
    </main>
  );
}
