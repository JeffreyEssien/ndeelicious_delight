import { PaymentResult } from "@/components/checkout/payment-result";
import { getStorefrontContent } from "@/lib/data/settings";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; cancelled?: string }>;
}) {
  const [params, content] = await Promise.all([searchParams, getStorefrontContent()]);
  return (
    <PaymentResult
      sessionId={params.session_id ?? ""}
      cancelled={params.cancelled === "1"}
      content={content.orderSuccess}
    />
  );
}
