"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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

// "All" takes one product from each type in turn, so every kind gets a spot and the first
// type (Ready to order) leads.
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

function CounterCard({ product, typeLabel }: { product: Product; typeLabel: string }) {
  const t = useCustomerText("kitchen gallery");
  const money = useMoney();
  const cart = useCart();
  const [added, setAdded] = useState(false);
  const variants = getPurchasableVariants(product);
  const prices = (variants.length ? variants : getPublishedVariants(product)).map((v) => variantPrice(product, v));
  const from = prices.length ? Math.min(...prices) : productStartingPrice(product);
  const varies = prices.length > 1 && Math.max(...prices) !== from;
  const url = product.images?.[0]?.url ?? product.image;
  const defaultVariant = getDefaultPurchasableVariant(product);
  // One tap adds simple products; anything with choices or made to order opens its page.
  const quickAdd =
    product.shoppingMode !== "MADE_TO_ORDER" &&
    isProductPurchasable(product) &&
    variants.length === 1 &&
    defaultVariant;
  return (
    <article className="counter-card">
      <div className="counter-photo">
        {url && (
          <Image
            src={url}
            alt=""
            fill
            sizes="(max-width:700px) 64vw, 280px"
            style={product.imagePosition ? { objectPosition: product.imagePosition } : undefined}
          />
        )}
        {quickAdd ? (
          <button
            type="button"
            className={`counter-add${added ? " is-added" : ""}`}
            onClick={() => {
              cart.add(product, quickAdd.id);
              setAdded(true);
              setTimeout(() => setAdded(false), 1600);
            }}
            aria-label={t("Add {name} to basket", { name: product.name })}
          >
            <Icon name={added ? "check" : "plus"} />
          </button>
        ) : (
          <span className="counter-add is-link" aria-hidden="true">
            <Icon name="arrow" />
          </span>
        )}
      </div>
      {typeLabel && <small className="counter-type">{typeLabel}</small>}
      <Link className="counter-name" href={`/product/${product.slug}`}>
        {product.name}
      </Link>
      <p className="counter-price">{varies ? t("From {price}", { price: money(from) }) : money(from)}</p>
    </article>
  );
}

export function KitchenGallery({
  eyebrow,
  headline,
  products,
  filters,
  allLabel,
  allHref,
  allLinkLabel,
  instagram,
}: {
  eyebrow: string;
  headline: string;
  products: Product[];
  filters: KitchenFilter[];
  allLabel: string;
  allHref: string;
  allLinkLabel: string;
  instagram?: { href: string; label: string };
}) {
  const t = useCustomerText("kitchen gallery");
  const [active, setActive] = useState("ALL");
  const [progress, setProgress] = useState({ start: 0, size: 1 });
  const track = useRef<HTMLDivElement>(null);
  const filter = filters.find((item) => item.type === active);
  const shown = filter
    ? products.filter((product) => product.category === active).slice(0, PER_VIEW)
    : mixed(products, filters);
  const labels = Object.fromEntries(filters.map((item) => [item.type, item.label]));
  const counts = Object.fromEntries(
    filters.map((item) => [item.type, products.filter((product) => product.category === item.type).length]),
  );
  const menu = [{ type: "ALL", label: allLabel }, ...filters];

  // The thin line under the row shows how much of it is in view and where.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the filter changes the row.
  useEffect(() => {
    const element = track.current;
    if (!element) return;
    const measure = () => {
      const width = element.scrollWidth || 1;
      setProgress({ start: element.scrollLeft / width, size: Math.min(1, element.clientWidth / width) });
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      element.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [active]);

  const scroll = (direction: 1 | -1) =>
    track.current?.scrollBy({ left: direction * track.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="counter">
      <aside className="counter-panel">
        <span className="overline">{eyebrow}</span>
        <h2>{headline}</h2>
        {filters.length > 1 && (
          <nav className="counter-menu" aria-label={t("Show")}>
            {menu.map((item) => (
              <button
                type="button"
                key={item.type}
                aria-pressed={active === item.type}
                onClick={() => {
                  setActive(item.type);
                  track.current?.scrollTo({ left: 0 });
                }}
              >
                <span>{item.label}</span>
                {item.type !== "ALL" && <small>{counts[item.type]}</small>}
              </button>
            ))}
          </nav>
        )}
        <Link className="counter-cta" href={filter?.href ?? allHref}>
          {filter?.linkLabel ?? allLinkLabel} <Icon name="arrow" />
        </Link>
        {instagram && (
          <a className="counter-instagram" href={instagram.href} target="_blank" rel="noreferrer">
            <Icon name="instagram" /> {instagram.label}
          </a>
        )}
      </aside>
      <div className="counter-shelf">
        <div className="counter-track" ref={track} key={active}>
          {shown.map((product) => (
            <CounterCard
              key={product.id}
              product={product}
              typeLabel={filter ? "" : (labels[product.category] ?? "")}
            />
          ))}
        </div>
        <div className="counter-controls">
          <span className="counter-progress" aria-hidden="true">
            <i style={{ left: `${progress.start * 100}%`, width: `${progress.size * 100}%` }} />
          </span>
          <button type="button" onClick={() => scroll(-1)} aria-label={t("Scroll back")}>
            <Icon name="chevron" />
          </button>
          <button type="button" onClick={() => scroll(1)} aria-label={t("Scroll forward")}>
            <Icon name="chevron" />
          </button>
        </div>
      </div>
    </div>
  );
}
