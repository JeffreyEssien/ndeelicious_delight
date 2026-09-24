"use client";
import { useState } from "react";
import type { Product } from "@/types";
import { useCart } from "@/components/providers";
import { formatMoney } from "@/lib/format";
import { Icon } from "@/components/ui/icons";
export function ProductPurchase({ product }: { product: Product }) {
  const [variant, setVariant] = useState(product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const cart = useCart();
  const selected = product.variants.find((v) => v.id === variant);
  if (!selected) return <p className="stock-note">This product does not have an available option.</p>;
  const unavailable = product.status !== "ACTIVE" || selected.stockQuantity === 0;
  return (
    <div className="purchase-box">
      <fieldset className="variant-options">
        <legend>Choose an option</legend>
        {product.variants.map((v) => (
          <label key={v.id} className={variant === v.id ? "selected" : ""}>
            <input
              type="radio"
              name="variant"
              value={v.id}
              checked={variant === v.id}
              onChange={() => setVariant(v.id)}
            />
            <span>{v.name}</span>
            <b>{v.priceAdjustment ? `+${formatMoney(v.priceAdjustment)}` : "Included"}</b>
          </label>
        ))}
      </fieldset>
      <div className="purchase-row">
        <div className="quantity large">
          <button type="button" onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Decrease quantity">
            <Icon name="minus" />
          </button>
          <span>{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(Math.min(selected.stockQuantity, quantity + 1))}
            aria-label="Increase quantity"
          >
            <Icon name="plus" />
          </button>
        </div>
        <button
          type="button"
          className="button button-primary add-main"
          disabled={unavailable}
          onClick={() => cart.add(product, variant, quantity)}
        >
          {unavailable
            ? "Unavailable"
            : `Add to basket · ${formatMoney((product.price + selected.priceAdjustment) * quantity)}`}
        </button>
      </div>
      <p className="stock-note">
        {unavailable
          ? "This option is currently unavailable."
          : selected.stockQuantity <= product.lowStockThreshold
            ? `Only ${selected.stockQuantity} left for this bake.`
            : "Available to add to your basket."}
      </p>
    </div>
  );
}
