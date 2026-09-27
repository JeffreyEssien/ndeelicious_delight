"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useBusinessSettings, useMoney, useProducts } from "@/components/providers";
import { ProductGrid } from "./product-grid";
import { Icon } from "@/components/ui/icons";
import { Button, EmptyState, Input, Pagination } from "@/components/ui/primitives";
import {
  availableProductPrice,
  cakeRecommendationBands,
  cakeRecommendationHref,
  deriveBudgetPresets,
} from "@/features/budget/recommendations";
import type { Category } from "@/types";
import type { CakeConfigurationData, StorefrontContent } from "@/types/content";

type Sort = "featured" | "newest" | "low" | "high";

export function Catalogue({
  initialCategory,
  maximumPrice,
  cakeConfiguration,
  budgetContent,
}: {
  initialCategory?: Category;
  maximumPrice?: number;
  cakeConfiguration: CakeConfigurationData;
  budgetContent: StorefrontContent["shopBudget"];
}) {
  const products = useProducts();
  const money = useMoney();
  const business = useBusinessSettings();
  const [category, setCategory] = useState<Category | "ALL">(initialCategory ?? "ALL");
  const [available, setAvailable] = useState(false);
  const [sort, setSort] = useState<Sort>("featured");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [budget, setBudget] = useState<number | undefined>(maximumPrice);
  const [budgetInput, setBudgetInput] = useState(maximumPrice ? String(maximumPrice / 100) : "");
  const [budgetError, setBudgetError] = useState("");
  const perPage = 6;
  const presets = useMemo(() => deriveBudgetPresets(products), [products]);
  const cakeBands = useMemo(
    () => (budget ? cakeRecommendationBands(cakeConfiguration.options, budget, 3, 12) : []),
    [budget, cakeConfiguration.options],
  );
  const items = useMemo(
    () =>
      products
        .filter(
          (product) =>
            (category === "ALL" || product.category === category) &&
            (budget === undefined || availableProductPrice(product) <= budget) &&
            (!available || product.status === "ACTIVE") &&
            `${product.name} ${product.shortDescription}`.toLowerCase().includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "low"
            ? a.price - b.price
            : sort === "high"
              ? b.price - a.price
              : sort === "newest"
                ? b.id.localeCompare(a.id)
                : Number(!!b.featured) - Number(!!a.featured),
        ),
    [category, available, sort, query, products, budget],
  );
  const visible = items.slice((page - 1) * perPage, page * perPage);
  const reset = () => setPage(1);

  function applyBudget(event: FormEvent) {
    event.preventDefault();
    const next = Math.round(Number(budgetInput) * 100);
    if (!Number.isFinite(next) || next <= 0) {
      setBudgetError(budgetContent.validationError);
      return;
    }
    setBudget(next);
    setBudgetError("");
    reset();
  }

  return (
    <>
      <div className="catalogue-tools">
        <div className="catalogue-search">
          <Icon name="search" />
          <input
            aria-label="Search catalogue"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              reset();
            }}
            placeholder="Search the bakery"
          />
        </div>
        <button type="button" className="button button-secondary mobile-only" onClick={() => setFilters(true)}>
          Filters & budget
        </button>
        <label className="sort-control">
          <span>Sort by</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as Sort);
              reset();
            }}
          >
            <option value="featured">Featured</option>
            <option value="newest">Newest</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
          </select>
        </label>
      </div>
      <div className="catalogue-layout">
        <aside className={`filters shop-filter-sidebar ${filters ? "is-open" : ""}`}>
          <div className="mobile-only panel-head">
            <h3>Filters & budget</h3>
            <button type="button" className="icon-button" onClick={() => setFilters(false)} aria-label="Close filters">
              <Icon name="close" />
            </button>
          </div>
          <section className="sidebar-budget" aria-labelledby="sidebar-budget-title">
            <span className="overline">{budgetContent.eyebrow}</span>
            <h3 id="sidebar-budget-title">{budgetContent.headline}</h3>
            <p>{budgetContent.body}</p>
            <form onSubmit={applyBudget}>
              <Input
                label={`${budgetContent.inputLabel} (${business.currency})`}
                type="number"
                min="1"
                step="0.01"
                value={budgetInput}
                placeholder={budgetContent.inputPlaceholder}
                error={budgetError}
                onChange={(event) => setBudgetInput(event.target.value)}
              />
              <Button type="submit">{budgetContent.buttonLabel}</Button>
            </form>
            <p className="sidebar-budget-note">{budgetContent.moneyNote}</p>
            <div className="sidebar-budget-presets">
              {presets.map((preset) => (
                <button
                  type="button"
                  className={budget === preset.maximum ? "active" : ""}
                  key={preset.maximum}
                  onClick={() => {
                    setBudget(preset.maximum);
                    setBudgetInput(String(preset.maximum / 100));
                    setBudgetError("");
                    reset();
                  }}
                >
                  {budgetContent.upToLabel} {money(preset.maximum)}
                </button>
              ))}
            </div>
            {budget && (
              <button
                type="button"
                className="text-button sidebar-budget-clear"
                onClick={() => {
                  setBudget(undefined);
                  setBudgetInput("");
                  reset();
                }}
              >
                {budgetContent.clearLabel}
              </button>
            )}
          </section>
          <fieldset>
            <legend>Category</legend>
            {[
              ["ALL", "All treats"],
              ["PASTRIES", "Fresh pastries"],
              ["READY_TO_BAKE", "Ready to bake"],
              ["CUSTOM_CAKES", "Celebration cakes"],
            ].map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="category"
                  checked={category === value}
                  onChange={() => {
                    setCategory(value as Category | "ALL");
                    reset();
                  }}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Availability</legend>
            <label>
              <input
                type="checkbox"
                checked={available}
                onChange={(event) => {
                  setAvailable(event.target.checked);
                  reset();
                }}
              />
              <span>Available now</span>
            </label>
          </fieldset>
          <button type="button" className="button button-primary mobile-only" onClick={() => setFilters(false)}>
            Show {items.length} products
          </button>
        </aside>
        <div className="catalogue-results">
          <p className="result-count">
            {items.length} {items.length === 1 ? "treat" : "treats"}
            {budget !== undefined ? ` within ${money(budget)}` : ""}
          </p>
          {items.length ? (
            <>
              <ProductGrid items={visible} />
              <Pagination page={page} pages={Math.ceil(items.length / perPage)} onChange={setPage} />
            </>
          ) : (
            <EmptyState
              title="Nothing matched that search"
              body="Try a broader search, another budget, or clear your filters."
              action={
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setQuery("");
                    setCategory("ALL");
                    setAvailable(false);
                    setBudget(undefined);
                    setBudgetInput("");
                  }}
                >
                  Clear filters
                </button>
              }
            />
          )}
          {budget && (
            <section className="catalogue-cake-budget" aria-labelledby="cake-budget-results-title">
              <div className="section-title-row">
                <div>
                  <span className="overline">{budgetContent.cakesEyebrow}</span>
                  <h2 id="cake-budget-results-title">Cake ideas across your budget</h2>
                  <p>Explore simpler and more detailed builds without spending your whole budget.</p>
                </div>
              </div>
              {cakeBands.length ? (
                cakeBands.map((band) => (
                  <section className="cake-budget-band" key={band.maximum}>
                    <header>
                      <h3>Ideas up to {money(band.maximum)}</h3>
                      <span>{band.recommendations.length} combinations</span>
                    </header>
                    <div className="cake-budget-scroll">
                      {band.recommendations.map((cake) => (
                        <article key={`${band.maximum}-${cake.id}`}>
                          <strong>{money(cake.total)}</strong>
                          <h4>
                            {cake.selections.size.name} {cake.selections.flavour.name} cake
                          </h4>
                          <p>
                            {cake.selections.filling.name} · {cake.selections.design.name}
                          </p>
                          <Link className="button button-secondary" href={cakeRecommendationHref(cake)}>
                            {budgetContent.customizeLabel}
                          </Link>
                        </article>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <p className="budget-empty">{budgetContent.emptyCakes}</p>
              )}
              <p className="budget-disclaimer">{budgetContent.disclaimer}</p>
            </section>
          )}
        </div>
      </div>
      {filters && (
        <button
          type="button"
          className="scrim mobile-only"
          onClick={() => setFilters(false)}
          aria-label="Close filters"
        />
      )}
    </>
  );
}
