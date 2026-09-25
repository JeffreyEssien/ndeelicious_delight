import { CartPage } from "@/components/cart/cart-page";
import { ContentLines } from "@/components/ui/content-lines";
import { getStorefrontContent } from "@/lib/data/settings";
export default async function Page() {
  const { headers } = await getStorefrontContent();
  return (
    <>
      <header className="page-hero small">
        <span className="overline">{headers.cart.eyebrow}</span>
        <h1>
          <ContentLines text={headers.cart.headline} />
        </h1>
        {headers.cart.supportingText && <p>{headers.cart.supportingText}</p>}
      </header>
      <section className="site-container cart-page">
        <CartPage />
      </section>
    </>
  );
}
