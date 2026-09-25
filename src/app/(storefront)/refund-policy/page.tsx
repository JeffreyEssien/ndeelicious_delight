import { PolicyPage } from "@/components/layout/policy-page";
import { getStorefrontContent } from "@/lib/data/settings";
export default async function Page() {
  const { policies } = await getStorefrontContent();
  return <PolicyPage policy={policies.refund} />;
}
