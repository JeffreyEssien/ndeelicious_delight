import { CheckoutFlow } from "@/components/checkout/checkout-flow";
import { getBusinessSettings } from "@/lib/data/settings";

export default async function Page() {
  return <CheckoutFlow business={await getBusinessSettings()} />;
}
