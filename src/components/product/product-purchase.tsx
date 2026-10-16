"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Product } from "@/types";
import { useCart, useMoney, useBusinessSettings } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import {
  getDefaultPurchasableVariant,
  getPublishedVariants,
  isVariantPurchasable,
  isVariantInventoryTracked,
  variantQuantityLimit,
} from "@/features/catalog/availability";
import { variantPrice } from "@/features/catalog/pricing";
import { earliestFulfilment } from "@/features/fulfilment/schedule";
import { trackCommerceEvent } from "@/lib/analytics/client";

export function ProductPurchase({ product }: { product: Product }) {
  const t = useCustomerText("product purchase");
  const params = useSearchParams();
  const madeToOrder = product.shoppingMode === "MADE_TO_ORDER";
  const isCake = product.category === "CUSTOM_CAKES";
  const optionGroups = product.optionGroups ?? [];
  const requested = product.variants.find((v) => v.id === params.get("variant") && isVariantPurchasable(product, v));
  const [variant, setVariant] = useState(
    requested?.id ?? (madeToOrder ? "" : (getDefaultPurchasableVariant(product)?.id ?? "")),
  );
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const cart = useCart();
  const business = useBusinessSettings();
  const formatMoney = useMoney();
  const options = getPublishedVariants(product);
  const selected = options.find((v) => v.id === variant);
  // Cakes are made-to-order but sold as single cakes, not packs — keep pack wording off them.
  const sellingPacks = !isCake && (madeToOrder || Boolean(selected?.packQuantity));
  const limit = selected ? variantQuantityLimit(product, selected) : 0;
  const count = Math.max(1, Math.min(quantity, limit || 1));
  // Cakes expand their "Flavour"/"Filling" groups into one picker per layer, driven by the
  // chosen size's layer count. Everything else renders its option groups as-is.
  const flavourChoices = optionGroups.find((group) => group.name === "Flavour")?.choices ?? [];
  const fillingChoices = optionGroups.find((group) => group.name === "Filling")?.choices ?? [];
  const isLayeredCake = isCake && (flavourChoices.length > 0 || fillingChoices.length > 0);
  const layerCount = selected ? (product.cakeLayers?.[selected.id] ?? 1) : 0;
  type Picker = { key: string; label: string; options: string[]; required: boolean };
  let pickers: Picker[];
  if (isLayeredCake) {
    pickers = selected
      ? Array.from({ length: layerCount }, (_, i) => i + 1).flatMap((layer) => {
          const prefix = layerCount > 1 ? `Layer ${layer} ` : "";
          const rows: Picker[] = [];
          if (flavourChoices.length)
            rows.push({ key: `L${layer}-flavour`, label: `${prefix}flavour`, options: flavourChoices, required: true });
          if (fillingChoices.length)
            rows.push({ key: `L${layer}-filling`, label: `${prefix}filling`, options: fillingChoices, required: true });
          return rows;
        })
      : [];
  } else {
    pickers = optionGroups.map((group) => ({
      key: group.id,
      label: group.name,
      options: group.choices,
      required: group.required,
    }));
  }
  const selections = pickers.flatMap((picker) =>
    choices[picker.key] ? [{ group: picker.label, value: choices[picker.key] }] : [],
  );
  const missingChoice = pickers.find((picker) => picker.required && !choices[picker.key]);
  const unavailable = !selected || limit < 1 || Boolean(missingChoice);
  let availabilityLabel = "Enter your postal code at checkout to confirm delivery availability.";
  if (business.pickupEnabled) {
    try {
      availabilityLabel = `Earliest pickup: ${earliestFulfilment({ mode: "pickup", schedule: business.fulfilmentSchedule ?? null, preparationHours: product.preparationHours ?? 0 }).label}`;
    } catch (reason) {
      availabilityLabel = reason instanceof Error ? reason.message : "Schedule setup is required.";
    }
  }
  useEffect(() => {
    trackCommerceEvent("PRODUCT_VIEWED", { productId: product.id });
  }, [product.id]);
  function choose(id: string) {
    const next = options.find((v) => v.id === id);
    setVariant(next && isVariantPurchasable(product, next) ? id : "");
    setQuantity((current) => Math.max(1, Math.min(current, next ? variantQuantityLimit(product, next) : 1)));
  }
  return (
    <div className="purchase-box">
      <fieldset className="variant-options pack-options">
        <legend>{t(isCake ? "Choose your size" : madeToOrder ? "Choose your pack" : "Choose your option")}</legend>
        {!options.length ? (
          <p className="stock-note">
            {t(
              isCake
                ? "No sizes are available right now."
                : madeToOrder
                  ? "No packs are available right now."
                  : "This product does not have an available option.",
            )}
          </p>
        ) : options.length > 6 ? (
          <label className="pack-compact-label">
            <span>{t(isCake ? "Size" : madeToOrder ? "Pack options" : "Product options")}</span>
            <select value={selected?.id ?? ""} onChange={(event) => choose(event.target.value)}>
              <option value="">{t(isCake ? "Choose your size" : "Choose your pack")}</option>
              {options.map((v) => (
                <option key={v.id} value={v.id} disabled={!isVariantPurchasable(product, v)}>
                  {v.name}
                  {!isCake && v.packQuantity ? ` · ${v.packQuantity} pieces` : ""} · {formatMoney(variantPrice(product, v))}
                  {!isVariantPurchasable(product, v) ? " · Sold out" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          options.map((v) => (
            <label
              key={v.id}
              className={`${variant === v.id ? "selected" : ""} ${!isVariantPurchasable(product, v) ? "pack-sold-out" : ""}`}
            >
              <input
                type="radio"
                name="variant"
                value={v.id}
                checked={variant === v.id}
                disabled={!isVariantPurchasable(product, v)}
                onChange={() => choose(v.id)}
              />
              <span>
                {v.name}
                <small>
                  {!isCake && v.packQuantity ? `${v.packQuantity} pieces per pack` : ""}
                  {!isVariantPurchasable(product, v) ? " · Sold out" : ""}
                </small>
              </span>
              <b>{formatMoney(variantPrice(product, v))}</b>
            </label>
          ))
        )}
      </fieldset>
      {isLayeredCake && !selected && <p className="stock-note">{t("Choose a size to pick your flavours.")}</p>}
      {pickers.length > 0 && (
        <fieldset className="cake-option-groups">
          {pickers.map((picker) => (
            <label key={picker.key} className="cake-option-group">
              <span>
                {picker.label}
                {picker.required ? "" : ` (${t("optional")})`}
              </span>
              <select
                value={choices[picker.key] ?? ""}
                onChange={(event) => setChoices((current) => ({ ...current, [picker.key]: event.target.value }))}
              >
                <option value="">{t("Choose an option")}</option>
                {picker.options.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>
      )}
      <div className="pack-selection-summary" aria-live="polite" aria-atomic="true">
        {selected ? (
          <>
            <strong>
              {formatMoney(variantPrice(product, selected))} {t(sellingPacks ? "per pack" : "each")}
            </strong>
            <span>
              {count} {sellingPacks ? (count === 1 ? "pack" : "packs") : count === 1 ? "item" : "items"}
              {!isCake && selected.packQuantity ? ` · ${count * selected.packQuantity} pieces` : ""}
            </span>
          </>
        ) : (
          <span>{t(isCake ? "Select a size to continue." : "Select an available pack to continue.")}</span>
        )}
      </div>
      <p className="stock-note">{availabilityLabel}</p>
      <div className="purchase-row">
        <fieldset className="quantity large" aria-label={t(sellingPacks ? "Quantity of packs" : "Quantity of items")}>
          <button
            type="button"
            disabled={unavailable || count <= 1}
            onClick={() => setQuantity(count - 1)}
            aria-label={t("Decrease quantity")}
          >
            <Icon name="minus" />
          </button>
          <span>{count}</span>
          <button
            type="button"
            disabled={unavailable || count >= limit}
            onClick={() => setQuantity(count + 1)}
            aria-label={t("Increase quantity")}
          >
            <Icon name="plus" />
          </button>
        </fieldset>
        <button
          type="button"
          className="button button-primary add-main"
          disabled={unavailable}
          onClick={() => cart.add(product, variant, count, selections)}
        >
          {!selected
            ? t(isCake ? "Choose a size" : madeToOrder ? "Choose a pack" : "Choose an option")
            : missingChoice
              ? t("Choose {value1}", { value1: missingChoice.label })
              : limit < 1
                ? t("Unavailable")
                : t("Add to basket · {value1}", { value1: formatMoney(variantPrice(product, selected) * count) })}
        </button>
      </div>
      {(optionGroups.length > 0 || variant) && (
        <button
          type="button"
          className="text-button clear-selection"
          onClick={() => {
            setVariant(madeToOrder ? "" : (getDefaultPurchasableVariant(product)?.id ?? ""));
            setChoices({});
            setQuantity(1);
          }}
        >
          {t("Clear")}
        </button>
      )}
      <p className="stock-note">
        {unavailable
          ? t("Choose an available option above.")
          : selected && isVariantInventoryTracked(product, selected)
            ? `${selected.stockQuantity} ${sellingPacks ? "packs" : "items"} available.`
            : t(madeToOrder ? "Prepared to order for you." : "Available to add to your basket.")}
      </p>
    </div>
  );
}
