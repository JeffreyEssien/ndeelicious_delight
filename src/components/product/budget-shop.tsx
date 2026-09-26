"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useBusinessSettings, useMoney, useProducts } from "@/components/providers";
import { ProductGrid } from "@/components/product/product-grid";
import { Button, Input } from "@/components/ui/primitives";
import {
  cakeRecommendationHref,
  cakeRecommendations,
  deriveBudgetBands,
  productsInBudget,
  type BudgetBand,
} from "@/features/budget/recommendations";
import type { CakeConfigurationData, StorefrontContent } from "@/types/content";

type BudgetSelection = { minimum: number; maximum: number; source: "band" | "custom" };

export function BudgetShop({
  cakeConfiguration,
  content,
}: {
  cakeConfiguration: CakeConfigurationData;
  content: StorefrontContent["shopBudget"];
}) {
  const products = useProducts();
  const money = useMoney();
  const business = useBusinessSettings();
  const bands = useMemo(() => deriveBudgetBands(products), [products]);
  const [selection, setSelection] = useState<BudgetSelection | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const matchingProducts = selection ? productsInBudget(products, selection.minimum, selection.maximum) : [];
  const cakes = selection ? cakeRecommendations(cakeConfiguration.options, selection.minimum, selection.maximum) : [];

  function chooseBand(band: BudgetBand) {
    setSelection({ minimum: band.minimum, maximum: band.maximum, source: "band" });
    setAmount("");
    setError("");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const maximum = Math.round(Number(amount) * 100);
    if (!Number.isFinite(maximum) || maximum <= 0) {
      setError(content.validationError);
      return;
    }
    setSelection({ minimum: 0, maximum, source: "custom" });
    setError("");
  }

  return (
    <section className="budget-shop" aria-labelledby="budget-shop-title">
      <div className="budget-intro">
        <div>
          <span className="overline">{content.eyebrow}</span>
          <h2 id="budget-shop-title">{content.headline}</h2>
          <p>{content.body}</p>
        </div>
        <form onSubmit={submit} className="budget-form">
          <Input
            label={`${content.inputLabel} (${business.currency})`}
            inputMode="decimal"
            type="number"
            min="1"
            step="0.01"
            placeholder={content.inputPlaceholder}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={error}
          />
          <Button type="submit">{content.buttonLabel}</Button>
        </form>
      </div>
      {!!bands.length && (
        <div className="budget-bands" aria-label={content.rangeAriaLabel}>
          {bands.map((band) => {
            const active =
              selection?.source === "band" && selection.minimum === band.minimum && selection.maximum === band.maximum;
            return (
              <button
                type="button"
                className={active ? "active" : ""}
                onClick={() => chooseBand(band)}
                key={`${band.minimum}-${band.maximum}`}
              >
                <span>
                  {band.minimum === band.maximum
                    ? money(band.maximum)
                    : `${money(band.minimum)} – ${money(band.maximum)}`}
                </span>
                <small>
                  {band.productCount} {band.productCount === 1 ? content.productSingular : content.productPlural}
                </small>
              </button>
            );
          })}
        </div>
      )}
      {selection && (
        <div className="budget-results" aria-live="polite">
          <div className="budget-result-summary">
            <span>
              {content.resultPrefix}{" "}
              {selection.minimum > 0
                ? `${content.fromLabel} ${money(selection.minimum)} ${content.toLabel} `
                : `${content.upToLabel} `}
              <b>{money(selection.maximum)}</b>
            </span>
            <button
              type="button"
              onClick={() => {
                setSelection(null);
                setAmount("");
              }}
            >
              {content.clearLabel}
            </button>
          </div>
          <section className="budget-product-results">
            <div className="section-title-row">
              <div>
                <span className="overline">{content.catalogueEyebrow}</span>
                <h3>{content.productsTitle}</h3>
              </div>
              <b>{matchingProducts.length}</b>
            </div>
            {matchingProducts.length ? (
              <ProductGrid items={matchingProducts.slice(0, 8)} />
            ) : (
              <p className="budget-empty">{content.emptyProducts}</p>
            )}
          </section>
          <section className="budget-cake-results">
            <div className="section-title-row">
              <div>
                <span className="overline">{content.cakesEyebrow}</span>
                <h3>{content.cakesTitle}</h3>
              </div>
              <b>{cakes.length}</b>
            </div>
            {cakes.length ? (
              <div className="budget-cake-grid">
                {cakes.map((cake, index) => (
                  <article key={cake.id}>
                    <header>
                      <span>
                        {content.recommendationLabel} {String(index + 1).padStart(2, "0")}
                      </span>
                      <strong>{money(cake.total)}</strong>
                    </header>
                    <h4>
                      {cake.selections.size.name} {cake.selections.flavour.name} cake
                    </h4>
                    <dl>
                      {(["occasion", "size", "flavour", "filling", "design"] as const).map((type) => (
                        <div key={type}>
                          <dt>{type}</dt>
                          <dd>{cake.selections[type].name}</dd>
                        </div>
                      ))}
                    </dl>
                    <Link className="button button-secondary" href={cakeRecommendationHref(cake)}>
                      {content.customizeLabel}
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <p className="budget-empty">{content.emptyCakes}</p>
            )}
          </section>
          <p className="budget-disclaimer">{content.disclaimer}</p>
        </div>
      )}
    </section>
  );
}
