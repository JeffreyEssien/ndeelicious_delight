"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/types";
import { useMoney } from "@/components/providers";
import { useCart } from "@/components/providers";
import { useWishlist } from "@/components/wishlist";
import { Badge } from "@/components/ui/primitives";
import { ModalOverlay } from "@/components/ui/modal-overlay";
import { productStartingPrice, preparationLabel, variantPrice } from "@/features/catalog/pricing";
import { Icon } from "@/components/ui/icons";
import {
  getPublishedVariants,
  getDefaultPurchasableVariant,
  getPurchasableVariants,
  isProductPurchasable,
} from "@/features/catalog/availability";
export function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const t = useCustomerText("product card");

  const formatMoney = useMoney();
  const cart = useCart();
  const wishlist = useWishlist();
  const [quick, setQuick] = useState(false);
  const unavailable = !isProductPurchasable(product);
  const defaultVariant = getDefaultPurchasableVariant(product);
  const madeToOrder = product.shoppingMode === "MADE_TO_ORDER";
  const availableVariants = getPurchasableVariants(product);
  const priceVariants = availableVariants.length ? availableVariants : getPublishedVariants(product);
  const hasDifferentPrices = new Set(priceVariants.map((v) => variantPrice(product, v))).size > 1;
  const hasUnambiguousVariant = getPurchasableVariants(product).length === 1;
  const saved = wishlist.has(product.id);

  function action() {
    if (madeToOrder)
      return (
        <Link className="button button-secondary pack-select-link" href={`/product/${product.slug}`}>
          {t("Select options")}
        </Link>
      );
    if (unavailable) return null;
    if (defaultVariant && hasUnambiguousVariant)
      return (
        <button
          type="button"
          className="round-add"
          onClick={() => cart.add(product, defaultVariant.id)}
          aria-label={t("Add {value1} to basket", { value1: product.name })}
        >
          <Icon name="plus" />
        </button>
      );
    return (
      <Link
        className="round-add"
        aria-label={t("Choose options for {value1}", { value1: product.name })}
        href={`/product/${product.slug}`}
      >
        <Icon name="chevron" />
      </Link>
    );
  }

  return (
    <article className="product-card">
      <div className="product-photo-wrap">
        <Link className="product-photo" href={`/product/${product.slug}`}>
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              loading={eager ? "eager" : "lazy"}
              sizes={"(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"}
              style={{ objectPosition: product.imagePosition }}
            />
          ) : (
            <span className="missing-image">{t("No image uploaded")}</span>
          )}
          {product.badge && <Badge tone={"berry"}>{product.badge}</Badge>}
          {unavailable && <span className="sold-overlay">{t("Sold out")}</span>}
        </Link>
        <button
          type="button"
          className={`wishlist-heart ${saved ? "is-active" : ""}`}
          aria-pressed={saved}
          aria-label={
            saved
              ? t("Remove {value1} from favourites", { value1: product.name })
              : t("Save {value1} to favourites", { value1: product.name })
          }
          onClick={() => wishlist.toggle(product.id)}
        >
          <Icon name="heart" />
        </button>
        <button type="button" className="quick-view-trigger" onClick={() => setQuick(true)}>
          {t("Quick view")}
        </button>
      </div>
      <div className="product-meta">
        <div>
          <span>{madeToOrder ? t("Made to Order") : t(product.category.replaceAll("_", " "))}</span>
          <Link href={`/product/${product.slug}`}>
            <h3>{product.name}</h3>
          </Link>
          <p>
            {hasDifferentPrices ? "From " : ""}
            {formatMoney(productStartingPrice(product))}
          </p>
          <small>{preparationLabel(product)}</small>
        </div>
        {action()}
      </div>
      {quick && (
        <ModalOverlay open onClose={() => setQuick(false)} className="quick-view" ariaLabel={product.name}>
          <button
            type="button"
            className="icon-button quick-view-close"
            onClick={() => setQuick(false)}
            aria-label={t("Close")}
          >
            <Icon name="close" />
          </button>
          <div className="quick-view-media">
            {product.image ? (
              <Image src={product.image} alt={product.name} fill sizes="(max-width:720px) 100vw, 380px" />
            ) : (
              <span className="missing-image">{t("No image uploaded")}</span>
            )}
          </div>
          <div className="quick-view-body">
            <span className="overline">
              {madeToOrder ? t("Made to Order") : t(product.category.replaceAll("_", " "))}
            </span>
            <h2>{product.name}</h2>
            <p className="quick-view-price">
              {hasDifferentPrices ? "From " : ""}
              {formatMoney(productStartingPrice(product))}
            </p>
            {product.shortDescription && <p className="quick-view-desc">{product.shortDescription}</p>}
            <div className="quick-view-actions">
              {unavailable ? (
                <span className="quick-view-soldout">{t("Sold out")}</span>
              ) : defaultVariant && hasUnambiguousVariant && !madeToOrder ? (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    cart.add(product, defaultVariant.id);
                    setQuick(false);
                  }}
                >
                  {t("Add to basket")}
                </button>
              ) : (
                <Link className="button button-primary" href={`/product/${product.slug}`}>
                  {t("Select options")}
                </Link>
              )}
              <Link className="button button-secondary" href={`/product/${product.slug}`}>
                {t("View details")}
              </Link>
            </div>
            <button
              type="button"
              className={`text-button quick-view-save ${saved ? "is-active" : ""}`}
              onClick={() => wishlist.toggle(product.id)}
            >
              <Icon name="heart" /> {saved ? t("Saved to favourites") : t("Save to favourites")}
            </button>
          </div>
        </ModalOverlay>
      )}
    </article>
  );
}
