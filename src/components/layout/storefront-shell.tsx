import { whatsappUrl } from "@/lib/contact";
import { CartDrawer } from "@/components/cart/cart-drawer";
import { getBusinessSettings, getStorefrontContent } from "@/lib/data/settings";
import { Footer } from "./footer";
import { Header } from "./header";

export async function StorefrontShell({ children }: { children: React.ReactNode }) {
  const [content, business] = await Promise.all([getStorefrontContent(), getBusinessSettings()]);
  const whatsapp = whatsappUrl(business.whatsapp);
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Header content={content.global} business={business} />
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <Footer content={content.global} business={business} />
      <CartDrawer />
      {whatsapp && (
        <a
          className="whatsapp-fab"
          href={whatsapp}
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
