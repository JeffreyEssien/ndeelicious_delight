"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Product } from "@/types";
import { useCart, useMoney, useBusinessSettings } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import { getDefaultPurchasableVariant, isVariantPurchasable } from "@/features/catalog/availability";
import { variantPrice, preparationLabel } from "@/features/catalog/pricing";
import { earliestFulfilment } from "@/features/fulfilment/schedule";
import { trackCommerceEvent } from "@/lib/analytics/client";
export function ProductPurchase({ product }: { product: Product }) {
  const t = useCustomerText("product purchase");

  const params = useSearchParams();
  const requestedVariant = product.variants.find(
    (v) => v.id === params.get("variant") && isVariantPurchasable(product, v),
  );
  const [variant, setVariant] = useState(
    requestedVariant?.id ?? getDefaultPurchasableVariant(product)?.id ?? product.variants[0]?.id ?? "",
  );
  const [quantity, setQuantity] = useState(1);
  const cart = useCart();
  const business = useBusinessSettings();
  let availabilityLabel = "Enter your postal code at checkout to confirm delivery availability.";
  if (business.pickupEnabled) {
    try {
      availabilityLabel = `Earliest pickup: ${earliestFulfilment({ mode: "pickup", schedule: business.fulfilmentSchedule ?? null, preparationHours: product.preparationHours ?? 0 }).label}`;
    } catch (reason) {
      availabilityLabel = reason instanceof Error ? reason.message : "Schedule setup is required.";
    }
  }
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
        <legend>{t("Choose your pack")}</legend>
        {product.variants
          .filter((item) => item.active !== false)
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
              <span>{v.packQuantity ? `Pack of ${v.packQuantity}` : v.name}</span>
              <b>{formatMoney(variantPrice(product, v))}</b>
            </label>
          ))}
      </fieldset>
      <p aria-live="polite">
        <strong>{formatMoney(variantPrice(product, selected))}</strong> · {preparationLabel(product)}
        {selected.sku && <small> · SKU {selected.sku}</small>}
      </p>
      <p className="stock-note">{availabilityLabel}</p>
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
            onClick={() =>
              setQuantity(Math.min(product.trackInventory === false ? 50 : selected.stockQuantity, quantity + 1))
            }
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
                value1: formatMoney(variantPrice(product, selected) * quantity),
              })}
        </button>
      </div>
      <p className="stock-note">
        {unavailable
          ? t("This option is currently unavailable.")
          : product.trackInventory !== false && selected.stockQuantity <= product.lowStockThreshold
            ? t("Only {value1} left for this bake.", { value1: selected.stockQuantity })
            : t("Available to add to your basket.")}
      </p>
    </div>
  );
}
