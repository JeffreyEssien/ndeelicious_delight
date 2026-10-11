import "../../documents.css";
import { PaymentEntry } from "@/components/checkout/payment-entry";
export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string }> }) {
  const { session = "" } = await searchParams;
  return <PaymentEntry sessionId={session} />;
}
