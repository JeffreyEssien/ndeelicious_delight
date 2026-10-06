"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import Link from "next/link";
export default function NotFound() {
  const t = useCustomerText("not found");
  return (
    <main className="site-container state-page">
      <div className="empty-state">
        <span>404</span>
        <h1>{t("This treat has left the counter.")}</h1>
        <p>{t("Let’s get you back to something delicious.")}</p>
        <Link className="button button-primary" href="/shop">
          {t("Browse the bakery")}
        </Link>
      </div>
    </main>
  );
}
