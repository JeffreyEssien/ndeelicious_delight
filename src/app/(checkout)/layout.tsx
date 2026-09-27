import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-logo";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="checkout-header">
        <Link className="brand" href="/" aria-label="Ndeeelicious Delight home">
          <BrandLogo compact />
        </Link>
        <span>Secure checkout</span>
      </header>
      <main className="checkout-main">{children}</main>
    </>
  );
}
