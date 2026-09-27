import type { Metadata } from "next";
import { PolicyPage } from "@/components/layout/policy-page";
import { getStorefrontContent } from "@/lib/data/settings";
export const metadata: Metadata = { title: "Terms", alternates: { canonical: "/terms" } };
export default async function Page() {
  const { policies } = await getStorefrontContent();
  return <PolicyPage policy={policies.terms} />;
}
