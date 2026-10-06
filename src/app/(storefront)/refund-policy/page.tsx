import { getCustomerText } from "@/lib/customer-text";
import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/policy-page";
import { getStorefrontContent } from "@/lib/data/settings";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return { title: t("Refund policy"), alternates: { canonical: "/refund-policy" } };
}
export default async function Page() {
  const { policies } = await getStorefrontContent();
  return <PolicyPage policy={policies.refund} />;
}
