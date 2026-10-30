"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useCustomerText } from "@/components/customer-text-provider";
import { useCart, useMoney } from "@/components/providers";
import { Icon } from "@/components/ui/icons";
import {
  getDefaultPurchasableVariant,
  getPublishedVariants,
  getPurchasableVariants,
  isProductPurchasable,
} from "@/features/catalog/availability";
import { productStartingPrice, variantPrice } from "@/features/catalog/pricing";
import type { Product } from "@/types";

export type KitchenFilter = { type: string; label: string; href: string; linkLabel: string };

const PER_VIEW = 10;

// "All" takes one product from each type in turn, so every kind gets a spot on the shelf and
// the first type (Ready to order) leads.
function mixed(products: Product[], filters: KitchenFilter[]) {
  const queues = filters.map((filter) => products.filter((product) => product.category === filter.type));
  const result: Product[] = [];
  while (result.length < PER_VIEW && queues.some((queue) => queue.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && result.length < PER_VIEW) result.push(next);
    }
  }
  return result;
}

function ShelfCard({ product, typeLabel }: { product: Product; typeLabel: string }) {
  const t = useCustomerText("kitchen gallery");
  const money = useMoney();
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const variants = getPurchasableVariants(product);
  const prices = (variants.length ? variants : getPublishedVariants(product)).map((v) => variantPrice(product, v));
  const from = prices.length ? Math.min(...prices) : productStartingPrice(product);
  const varies = prices.length > 1 && Math.max(...prices) !== from;
  const photo = product.images?.[0];
  const url = photo?.url ?? product.image;
  const defaultVariant = getDefaultPurchasableVariant(product);
  // One tap adds simple products; anything with choices or made to order opens its page.
  const quickAdd =
    product.shoppingMode !== "MADE_TO_ORDER" &&
    isProductPurchasable(product) &&
    variants.length === 1 &&
    defaultVariant;
  return (
    <article className="shelf-card">
      <Link className="shelf-photo" href={`/product/${product.slug}`} tabIndex={-1} aria-hidden="true">
        {url && (
          <Image
            src={url}
            alt=""
            fill
            sizes="(max-width:700px) 72vw, 300px"
            style={product.imagePosition ? { objectPosition: product.imagePosition } : undefined}
          />
        )}
        {typeLabel && <span className="shelf-type">{typeLabel}</span>}
      </Link>
      <div className="shelf-body">
        <Link className="shelf-name" href={`/product/${product.slug}`}>
          {product.name}
        </Link>
        {product.shortDescription && <p>{product.shortDescription}</p>}
      </div>
      <div className="shelf-ticket">
        <span>
          {varies && <small>{t("From")}</small>}
          <b>{money(from)}</b>
        </span>
        {quickAdd ? (
          <button
            type="button"
            className={added ? "is-added" : undefined}
            onClick={() => {
              cart.add(product, quickAdd.id);
              setAdded(true);
              setTimeout(() => setAdded(false), 1600);
            }}
            aria-label={t("Add {name} to basket", { name: product.name })}
          >
            <Icon name={added ? "check" : "plus"} /> {added ? t("Added") : t("Add")}
          </button>
        ) : (
          <Link href={`/product/${product.slug}`} aria-label={t("Choose options for {name}", { name: product.name })}>
            {t("Choose")} <Icon name="arrow" />
          </Link>
        )}
      </div>
    </article>
  );
}

export function KitchenGallery({
  products,
  filters,
  allLabel,
  allHref,
  allLinkLabel,
}: {
  products: Product[];
  filters: KitchenFilter[];
  allLabel: string;
  allHref: string;
  allLinkLabel: string;
}) {
  const t = useCustomerText("kitchen gallery");
  const [active, setActive] = useState("ALL");
  const track = useRef<HTMLDivElement>(null);
  const filter = filters.find((item) => item.type === active);
  const shown = filter
    ? products.filter((product) => product.category === active).slice(0, PER_VIEW)
    : mixed(products, filters);
  const labels = Object.fromEntries(filters.map((item) => [item.type, item.label]));
  const chips = [{ type: "ALL", label: allLabel }, ...filters];
  const scroll = (direction: 1 | -1) =>
    track.current?.scrollBy({ left: direction * track.current.clientWidth * 0.8, behavior: "smooth" });
  function choose(type: string) {
    setActive(type);
    track.current?.scrollTo({ left: 0 });
  }
  return (
    <div className="shelf">
      <div className="shelf-bar">
        {filters.length > 1 && (
          <div className="shelf-filters">
            {chips.map((chip) => (
              <button
                type="button"
                key={chip.type}
                aria-pressed={active === chip.type}
                onClick={() => choose(chip.type)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
        <div className="shelf-arrows">
          <button type="button" onClick={() => scroll(-1)} aria-label={t("Scroll back")}>
            <Icon name="chevron" />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label={t("Scroll forward")}>
            <Icon name="chevron" />
          </button>
        </div>
      </div>
      <div className="shelf-track" ref={track} key={active}>
        {shown.map((product) => (
          <ShelfCard key={product.id} product={product} typeLabel={filter ? "" : (labels[product.category] ?? "")} />
        ))}
        <Link className="shelf-more" href={filter?.href ?? allHref}>
          <span>{filter?.linkLabel ?? allLinkLabel}</span>
          <Icon name="arrow" />
        </Link>
      </div>
    </div>
  );
}
