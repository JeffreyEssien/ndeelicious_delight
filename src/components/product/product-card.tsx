"use client";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/types";
import { formatMoney } from "@/lib/format";
import { useCart } from "@/components/providers";
import { Badge } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
export function ProductCard({ product }: { product: Product }) {
  const cart = useCart();
  const unavailable = product.status !== "ACTIVE";
  return (
    <article className="product-card">
      <Link className="product-photo" href={`/product/${product.slug}`}>
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
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
        <button
          type="button"
          className="round-add"
          disabled={unavailable}
          onClick={() => cart.add(product)}
          aria-label={`Add ${product.name} to basket`}
        >
          <Icon name="plus" />
        </button>
      </div>
    </article>
  );
}
