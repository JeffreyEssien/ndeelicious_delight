"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { useEffect, useState } from "react";
import type { Product } from "@/types";
import { useCart, useMoney } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import { getDefaultPurchasableVariant, isVariantPurchasable } from "@/features/catalog/availability";
import { trackCommerceEvent } from "@/lib/analytics/client";
export function ProductPurchase({ product }: { product: Product }) {
  const t = useCustomerText("product purchase");

  const [variant, setVariant] = useState(getDefaultPurchasableVariant(product)?.id ?? product.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const cart = useCart();
  const formatMoney = useMoney();
  const selected = product.variants.find((v) => v.id === variant);
  useEffect(() => {
    trackCommerceEvent("PRODUCT_VIEWED", { productId: product.id });
  }, [product.id]);
  if (!selected) return <p className="stock-note">{t("This product does not have an available option.")}</p>;
  const unavailable = !isVariantPurchasable(product, selected);
  return (
    <div className="purchase-box">
      <fieldset className="variant-options">
        <legend>{t("Choose an option")}</legend>
        {product.variants
          .filter((item) => item.active)
          .map((v) => (
            <label key={v.id} className={variant === v.id ? "selected" : ""}>
              <input
                type="radio"
                name="variant"
                value={v.id}
                checked={variant === v.id}
                disabled={!isVariantPurchasable(product, v)}
                onChange={() => setVariant(v.id)}
              />
              <span>{v.name}</span>
              <b>{v.priceAdjustment ? `+${formatMoney(v.priceAdjustment)}` : t("Included")}</b>
            </label>
          ))}
      </fieldset>
      <div className="purchase-row">
        <div className="quantity large">
          <button
            type="button"
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            aria-label={t("Decrease quantity")}
          >
            <Icon name="minus" />
          </button>
          <span>{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity(Math.min(selected.stockQuantity, quantity + 1))}
            aria-label={t("Increase quantity")}
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
            ? t("Unavailable")
            : t("Add to basket · {value1}", {
                value1: formatMoney((product.price + selected.priceAdjustment) * quantity),
              })}
        </button>
      </div>
      <p className="stock-note">
        {unavailable
          ? t("This option is currently unavailable.")
          : selected.stockQuantity <= product.lowStockThreshold
            ? t("Only {value1} left for this bake.", { value1: selected.stockQuantity })
            : t("Available to add to your basket.")}
      </p>
    </div>
  );
}
