import type { Metadata } from "next";
import { getCustomerText } from "@/lib/customer-text";
import { WishlistView } from "@/components/product/wishlist-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getCustomerText("page titles");
  return {
    title: t("Your favourites"),
    description: t("Treats you’ve saved for later."),
    alternates: { canonical: "/wishlist" },
    robots: { index: false, follow: true },
  };
}

export default async function WishlistPage() {
  const t = await getCustomerText("wishlist");
  return (
    <>
      <header className="page-hero small">
        <span className="overline">{t("Saved for later")}</span>
        <h1>{t("Your favourites")}</h1>
        <p>{t("The treats you’ve hearted. Your list is saved on this device.")}</p>
      </header>
      <section className="site-container catalogue-section">
        <WishlistView />
      </section>
    </>
  );
}
