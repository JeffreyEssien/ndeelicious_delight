"use client";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types";
import { useMoney } from "@/components/providers";
import { useCart } from "@/components/providers";
import { Badge } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import {
  getDefaultPurchasableVariant,
  getPurchasableVariants,
  isProductPurchasable,
} from "@/features/catalog/availability";
export function ProductCard({ product, eager = false }: { product: Product; eager?: boolean }) {
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
            sizes="(max-width:640px) 50vw, (max-width:1024px) 33vw, 25vw"
            style={{ objectPosition: product.imagePosition }}
          />
        ) : (
          <span className="missing-image">No image uploaded</span>
        )}
        {product.badge && <Badge tone="berry">{product.badge}</Badge>}
        {unavailable && <span className="sold-overlay">Sold out</span>}
      </Link>
      <div className="product-meta">
        <div>
          <span>{product.category.replaceAll("_", " ")}</span>
          <Link href={`/product/${product.slug}`}>
            <h3>{product.name}</h3>
          </Link>
          <p>{formatMoney(product.price)}</p>
        </div>
        {unavailable ? null : defaultVariant && hasUnambiguousVariant ? (
          <button
            type="button"
            className="round-add"
            onClick={() => cart.add(product, defaultVariant.id)}
            aria-label={`Add ${product.name} to basket`}
          >
            <Icon name="plus" />
          </button>
        ) : (
          <Link
            className="round-add"
            aria-label={`Choose options for ${product.name}`}
            href={`/product/${product.slug}`}
          >
            <Icon name="chevron" />
          </Link>
        )}
      </div>
    </article>
  );
}
