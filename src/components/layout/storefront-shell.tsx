import { CartDrawer } from "@/components/cart/cart-drawer";
import { getBusinessSettings, getStorefrontContent } from "@/lib/data/settings";
import { Footer } from "./footer";
import { Header } from "./header";

export async function StorefrontShell({ children }: { children: React.ReactNode }) {
  const [content, business] = await Promise.all([getStorefrontContent(), getBusinessSettings()]);
  const whatsapp = business.whatsapp.replace(/\D/g, "");
  return (
    <>
      <Header content={content.global} business={business} />
      <main>{children}</main>
      <Footer content={content.global} business={business} />
      <CartDrawer />
      {whatsapp && (
        <a
          className="whatsapp-fab"
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noreferrer"
          aria-label={`Chat with ${business.businessName} on WhatsApp`}
        >
          wa
        </a>
      )}
    </>
  );
}
