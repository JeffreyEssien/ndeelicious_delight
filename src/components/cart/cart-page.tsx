"use client";
import Image from "next/image";
import Link from "next/link";
import { useCart, useProducts } from "@/components/providers";
import { formatMoney } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
export function CartPage() {
  const cart = useCart();
  const products = useProducts();
  const lines = cart.lines.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    const variant = product?.variants.find((item) => item.id === line.variantId);
    return product && variant ? [{ line, product, variant }] : [];
  });
  if (!lines.length)
    return (
      <div className="empty-state cart-empty">
        <Icon name="bag" />
        <h2>Your basket is empty</h2>
        <p>There’s plenty still warm on the counter.</p>
        <Link className="button button-primary" href="/shop">
          Browse the bakery
        </Link>
      </div>
    );
  return (
    <div className="cart-page-grid">
      <div>
        <div className="cart-page-head">
          <h2>Your treats</h2>
          <button type="button" className="text-button" onClick={cart.clear}>
            Clear basket
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
                <span className="cart-image-empty missing-image">No image</span>
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
                Remove
              </button>
            </article>
          );
        })}
      </div>
      <aside className="order-summary">
        <span className="overline">Order summary</span>
        <div>
          <span>Subtotal</span>
          <b>{formatMoney(cart.subtotal)}</b>
        </div>
        <div>
          <span>Delivery</span>
          <span>Calculated next</span>
        </div>
        <div className="summary-total">
          <span>Estimated total</span>
          <b>{formatMoney(cart.subtotal)}</b>
        </div>
        <Link href="/checkout" className="button button-primary">
          Continue to checkout <Icon name="arrow" />
        </Link>
        <p>Secure checkout · Carefully prepared · Clear delivery updates</p>
      </aside>
    </div>
  );
}
