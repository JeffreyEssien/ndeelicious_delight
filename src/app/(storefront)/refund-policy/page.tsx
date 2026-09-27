import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/policy-page";
import { getStorefrontContent } from "@/lib/data/settings";
export const metadata: Metadata = { title: "Refund policy", alternates: { canonical: "/refund-policy" } };
export default async function Page() {
  const { policies } = await getStorefrontContent();
  return <PolicyPage policy={policies.refund} />;
}
