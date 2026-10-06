"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import Image from "next/image";
import Link from "next/link";
import { useCart, useMoney, useProducts } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
export function CartPage() {
  const t = useCustomerText("cart page");

  const cart = useCart();
  const products = useProducts();
  const formatMoney = useMoney();
  const lines = cart.lines.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    const variant = product?.variants.find((item) => item.id === line.variantId);
    return product && variant ? [{ line, product, variant }] : [];
  });
  if (!lines.length)
    return (
      <div className="empty-state cart-empty">
        <Icon name="bag" />
        <h2>{t("Your basket is empty")}</h2>
        <p>{t("There’s plenty still warm on the counter.")}</p>
        <Link className="button button-primary" href="/shop">
          {t("Browse the bakery")}
        </Link>
      </div>
    );
  return (
    <div className="cart-page-grid">
      <div>
        <div className="cart-page-head">
          <h2>{t("Your treats")}</h2>
          <button type="button" className="text-button" onClick={cart.clear}>
            {t("Clear basket")}
          </button>
        </div>
        {lines.map(({ line, product: p, variant: v }) => {
          return (
            <article className="cart-page-line" key={`${p.id}-${v.id}`}>
              {p.image ? (
                <Image
                  src={p.image}
                  alt={p.name}
                  width={140}
                  height={168}
                  style={{ objectPosition: p.imagePosition }}
                />
              ) : (
                <span className="cart-image-empty missing-image">{t("No image")}</span>
              )}
              <div>
                <h3>{p.name}</h3>
                <p>{v.name}</p>
                <strong>{formatMoney(p.price + v.priceAdjustment)}</strong>
                <div className="quantity large">
                  <button type="button" onClick={() => cart.update(p.id, v.id, line.quantity - 1)}>
                    <Icon name="minus" />
                  </button>
                  <span>{line.quantity}</span>
                  <button type="button" onClick={() => cart.update(p.id, v.id, line.quantity + 1)}>
                    <Icon name="plus" />
                  </button>
                </div>
              </div>
              <button type="button" className="text-button" onClick={() => cart.remove(p.id, v.id)}>
                {t("Remove")}
              </button>
            </article>
          );
        })}
      </div>
      <aside className="order-summary">
        <span className="overline">{t("Order summary")}</span>
        <div>
          <span>{t("Subtotal")}</span>
          <b>{formatMoney(cart.subtotal)}</b>
        </div>
        <div>
          <span>{t("Delivery")}</span>
          <span>{t("Calculated next")}</span>
        </div>
        <div className="summary-total">
          <span>{t("Estimated total")}</span>
          <b>{formatMoney(cart.subtotal)}</b>
        </div>
        <Link href="/checkout" className="button button-primary">
          {t("Continue to checkout")}
          <Icon name="arrow" />
        </Link>
        <p>{t("Secure checkout · Carefully prepared · Clear delivery updates")}</p>
      </aside>
    </div>
  );
}
