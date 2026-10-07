"use client";
import { useCustomerText } from "@/components/customer-text-provider";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types";
import { useMoney } from "@/components/providers";
import { useCart } from "@/components/providers";
import { Badge } from "@/components/ui/primitives";
import { productStartingPrice, preparationLabel } from "@/features/catalog/pricing";
import { Icon } from "@/components/ui/icons";
import {
  getDefaultPurchasableVariant,
  getPurchasableVariants,
  isProductPurchasable,
} from "@/features/catalog/availability";
export function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
  const t = useCustomerText("product card");

  const formatMoney = useMoney();
  const cart = useCart();
  const unavailable = !isProductPurchasable(product);
  const defaultVariant = getDefaultPurchasableVariant(product);
  const hasUnambiguousVariant = getPurchasableVariants(product).length === 1;
  return (
    <article className="product-card">
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
      <div className="product-meta">
        <div>
          <span>{t(product.category.replaceAll("_", " "))}</span>
          <Link href={`/product/${product.slug}`}>
            <h3>{product.name}</h3>
          </Link>
          <p>
            {getPurchasableVariants(product).length > 1 ? "From " : ""}
            {formatMoney(productStartingPrice(product))}
          </p>
          <small>{preparationLabel(product)}</small>
        </div>
        {unavailable ? null : defaultVariant && hasUnambiguousVariant ? (
          <button
            type="button"
            className="round-add"
            onClick={() => cart.add(product, defaultVariant.id)}
            aria-label={t("Add {value1} to basket", { value1: product.name })}
          >
            <Icon name="plus" />
          </button>
        ) : (
          <Link
            className="round-add"
            aria-label={t("Choose options for {value1}", { value1: product.name })}
            href={`/product/${product.slug}`}
          >
            <Icon name="chevron" />
          </Link>
        )}
      </div>
    </article>
  );
}
