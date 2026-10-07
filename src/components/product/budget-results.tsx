"use client";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMoney } from "@/components/providers";
import {
  purchasableBudgetOptions,
  cakeRecommendations,
  cakeRecommendationHref,
} from "@/features/budget/recommendations";
import { preparationLabel, shoppingMode } from "@/features/catalog/pricing";
import { leadTimeLabel } from "@/features/cakes/lead-time";
import type { Product } from "@/types";
import type { CakeConfigurationData } from "@/types/content";
export function BudgetResults({
  products,
  maximum,
  configuration,
  clear,
  sort = "featured",
}: {
  products: Product[];
  maximum: number;
  configuration: CakeConfigurationData;
  clear: () => void;
  sort?: "featured" | "newest" | "low" | "high";
}) {
  const [segment, setSegment] = useState("All");
  const money = useMoney();
  const options = useMemo(
    () =>
      purchasableBudgetOptions(products).sort((a, b) =>
        sort === "low"
          ? a.price - b.price
          : sort === "high"
            ? b.price - a.price
            : sort === "newest"
              ? b.product.id.localeCompare(a.product.id)
              : Number(!!b.product.featured) - Number(!!a.product.featured),
      ),
    [products, sort],
  );
  const matches = options.filter((option) => option.price <= maximum);
  const closest = matches.length
    ? []
    : options
        .filter((option) => option.price > maximum)
        .sort((a, b) => a.price - b.price)
        .slice(0, 3);
  const cakeIdeas = useMemo(
    () => cakeRecommendations(configuration.options, maximum, 2),
    [configuration.options, maximum],
  );
  const cakes = configuration.cakeTypes
    .filter((type) => type.active)
    .flatMap((type) => cakeIdeas.map((cake) => ({ type, cake })));
  const visibleMatches =
    segment === "Ready now"
      ? matches.filter(({ product }) => shoppingMode(product) === "READY_TO_ORDER" && !product.preparationHours)
      : matches;
  const count = (segment === "Custom cakes" ? 0 : visibleMatches.length) + (segment === "Ready now" ? 0 : cakes.length);
  return (
    <section className="budget-match-results" aria-label="Budget results">
      <div className="budget-match-head">
        <div>
          <small>Your budget</small>
          <h2>Up to {money(maximum)}</h2>
        </div>
        <button type="button" className="text-button" onClick={clear}>
          Clear budget
        </button>
      </div>
      <fieldset className="budget-match-tabs" aria-label="Budget result types">
        {["All", "Ready now", "Custom cakes"].map((label) => (
          <button type="button" key={label} aria-pressed={segment === label} onClick={() => setSegment(label)}>
            {label}
          </button>
        ))}
      </fieldset>
      <p role="status">{count} options found</p>
      <div className="budget-match-grid">
        {segment !== "Custom cakes" &&
          visibleMatches.map(({ product, variant, price }) => (
            <article key={`${product.id}-${variant.id}`}>
              <Link className="budget-match-photo" href={`/product/${product.slug}?variant=${variant.id}`}>
                {product.image ? (
                  <Image src={product.image} alt={product.name} fill sizes="(max-width:700px) 88px, 30vw" />
                ) : (
                  <span>Image coming soon</span>
                )}
              </Link>
              <div className="budget-match-info">
                <h3>{product.name}</h3>
                <p>{variant.name}</p>
                <div className="budget-match-action">
                  <strong>{money(price)}</strong>
                  <Link className="button button-secondary" href={`/product/${product.slug}?variant=${variant.id}`}>
                    View
                  </Link>
                </div>
                <small>
                  {money(maximum - price)} remaining · {preparationLabel(product)}
                </small>
              </div>
            </article>
          ))}
        {segment !== "Ready now" &&
          cakes.map(({ type, cake }) => (
            <article key={`${type.id}-${cake.id}`}>
              {type.image && (
                <div className="budget-match-photo">
                  <Image src={type.image} alt={type.name} fill sizes="88px" unoptimized />
                </div>
              )}
              <div className="budget-match-info">
                <h3>{type.name}</h3>
                <p>
                  {cake.selections.size.name} · {cake.selections.flavour.name}
                </p>
                <div className="budget-match-action">
                  <strong>{money(cake.total)}</strong>
                  <Link
                    className="button button-secondary"
                    href={`${cakeRecommendationHref(cake)}&cakeTypeId=${type.id}`}
                  >
                    Customize
                  </Link>
                </div>
                <small>Starting configuration · Minimum lead time: {leadTimeLabel(type)}</small>
              </div>
            </article>
          ))}
      </div>
      {count === 0 && <p>No options fit this budget. Try a larger budget or another section.</p>}
      {segment !== "Custom cakes" && closest.length > 0 && (
        <>
          <h3>Closest alternatives</h3>
          <div className="budget-match-grid">
            {closest.map(({ product, variant, price }) => (
              <article key={`${product.id}-${variant.id}`}>
                <div className="budget-match-info">
                  <h3>{product.name}</h3>
                  <p>{variant.name}</p>
                  <strong>{money(price)}</strong>
                  <small>{money(price - maximum)} above your budget</small>
                  <Link className="button button-secondary" href={`/product/${product.slug}?variant=${variant.id}`}>
                    View
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <p className="budget-disclaimer">
        Prices shown before configured tax and delivery. Cake estimates are confirmed by the bakery.
      </p>
    </section>
  );
}
