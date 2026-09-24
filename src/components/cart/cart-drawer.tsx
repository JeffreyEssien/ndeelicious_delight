"use client";
import Image from "next/image";
import Link from "next/link";
import { useCart, useProducts } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";
export function CartDrawer() {
  const cart = useCart();
  const products = useProducts();
  const lines = cart.lines.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId);
    const variant = product?.variants.find((item) => item.id === line.variantId);
    return product && variant ? [{ line, product, variant }] : [];
  });
  return (
    <>
      {cart.open && (
        <button
          type="button"
          className="scrim cart-scrim"
          onClick={() => cart.setOpen(false)}
          aria-label="Close basket"
        />
      )}
      <aside className={`cart-drawer ${cart.open ? "is-open" : ""}`} aria-hidden={!cart.open}>
        <div className="panel-head">
          <div>
            <span className="overline">Your order</span>
            <h2>
              Basket <small>{cart.count}</small>
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={() => cart.setOpen(false)} aria-label="Close basket">
            <Icon name="close" />
          </button>
        </div>
        <div className="cart-body">
          {!lines.length ? (
            <div className="empty-state">
              <Icon name="bag" />
              <h3>Your basket is waiting</h3>
              <p>Something lovely is only a few taps away.</p>
              <Link href="/shop" className="button button-primary" onClick={() => cart.setOpen(false)}>
                Browse the bakery
              </Link>
            </div>
          ) : (
            lines.map(({ line, product: p, variant: v }) => {
              return (
                <div className="cart-line" key={`${line.productId}-${line.variantId}`}>
                  {p.image ? (
                    <Image src={p.image} alt="" width={88} height={104} style={{ objectPosition: p.imagePosition }} />
                  ) : (
                    <span className="cart-image-empty missing-image">No image</span>
                  )}
                  <div>
                    <Link href={`/product/${p.slug}`} onClick={() => cart.setOpen(false)}>
                      {p.name}
                    </Link>
                    <small>{v.name}</small>
                    <strong>{formatMoney(p.price + v.priceAdjustment)}</strong>
                    <div className="quantity">
                      <button
                        type="button"
                        onClick={() => cart.update(p.id, v.id, line.quantity - 1)}
                        aria-label="Decrease quantity"
                      >
                        <Icon name="minus" />
                      </button>
                      <span>{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() => cart.update(p.id, v.id, line.quantity + 1)}
                        aria-label="Increase quantity"
                      >
                        <Icon name="plus" />
                      </button>
                    </div>
                  </div>
                  <button type="button" className="text-button" onClick={() => cart.remove(p.id, v.id)}>
                    Remove
                  </button>
                </div>
              );
            })
          )}
        </div>
        {!!lines.length && (
          <div className="cart-summary">
            <div>
              <span>Subtotal</span>
              <strong>{formatMoney(cart.subtotal)}</strong>
            </div>
            <p>Delivery is calculated at checkout.</p>
            <Link href="/cart" className="button button-secondary" onClick={() => cart.setOpen(false)}>
              View basket
            </Link>
            <Link href="/checkout" className="button button-primary" onClick={() => cart.setOpen(false)}>
              Checkout <Icon name="arrow" />
            </Link>
          </div>
        )}
      </aside>
    </>
  );
}
