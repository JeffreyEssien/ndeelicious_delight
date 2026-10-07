"use client";
import { useSearchParams } from "next/navigation";
import { useCustomerText } from "@/components/customer-text-provider";

import { type FormEvent, useMemo, useState } from "react";
import { useBusinessSettings, useMoney, useProducts } from "@/components/providers";
import { BudgetResults } from "./budget-results";
import { shoppingMode } from "@/features/catalog/pricing";
import { ProductGrid } from "./product-grid";
import { Icon } from "@/components/ui/icons";
import { Button, EmptyState, Input, Pagination } from "@/components/ui/primitives";
import {
  availableProductPrice,
  closestProductsAboveBudget,
  deriveBudgetPresets,
  productsInBudget,
} from "@/features/budget/recommendations";
import { isProductPurchasable } from "@/features/catalog/availability";
import type { Category } from "@/types";
import type { CakeConfigurationData, StorefrontContent } from "@/types/content";

type Sort = "featured" | "newest" | "low" | "high";

export function Catalogue({
  initialCategory,
  maximumPrice,
  cakeConfiguration,
  budgetContent,
  initialMode,
}: {
  initialCategory?: Category;
  initialMode?: string;
  maximumPrice?: number;
  cakeConfiguration: CakeConfigurationData;
  budgetContent: StorefrontContent["shopBudget"];
}) {
  const t = useCustomerText("catalogue");

  const params = useSearchParams();
  const urlBudget = Number(params.get("maxPrice"));
  const startingBudget =
    maximumPrice ?? (Number.isFinite(urlBudget) && urlBudget > 0 ? Math.round(urlBudget * 100) : undefined);
  const products = useProducts();
  const money = useMoney();
  const business = useBusinessSettings();
  const [category, setCategory] = useState<Category | "ALL">(initialCategory ?? "ALL");
  const [mode, setMode] = useState(initialMode ?? params.get("mode") ?? "ALL");
  const [available, setAvailable] = useState(false);
  const [sort, setSort] = useState<Sort>("featured");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [budget, setBudget] = useState<number | undefined>(startingBudget);
  const [budgetInput, setBudgetInput] = useState(startingBudget ? String(startingBudget / 100) : "");
  const [budgetError, setBudgetError] = useState("");
  const perPage = 6;
  const presets = useMemo(() => deriveBudgetPresets(products), [products]);
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          (category === "ALL" || product.category === category) &&
          (mode === "ALL" || shoppingMode(product) === mode) &&
          (!available || isProductPurchasable(product)) &&
          `${product.name} ${product.shortDescription} ${product.description} ${product.category}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [category, mode, available, query, products],
  );
  const items = useMemo(
    () =>
      [...(budget === undefined ? filteredProducts : productsInBudget(filteredProducts, budget))].sort((a, b) =>
        sort === "low"
          ? a.price - b.price
          : sort === "high"
            ? b.price - a.price
            : sort === "newest"
              ? b.id.localeCompare(a.id)
              : Number(!!b.featured) - Number(!!a.featured),
      ),
    [filteredProducts, sort, budget],
  );
  const closest = useMemo(
    () => (budget !== undefined && items.length === 0 ? closestProductsAboveBudget(filteredProducts, budget) : []),
    [budget, filteredProducts, items.length],
  );
  const visible = items.slice((page - 1) * perPage, page * perPage);
  const reset = () => setPage(1);

  function rememberBudget(value: number | undefined) {
    const url = new URL(window.location.href);
    if (value === undefined) url.searchParams.delete("maxPrice");
    else url.searchParams.set("maxPrice", String(value / 100));
    window.history.replaceState(null, "", url);
  }

  function applyBudget(event: FormEvent) {
    event.preventDefault();
    const next = Math.round(Number(budgetInput) * 100);
    if (!Number.isFinite(next) || next <= 0) {
      setBudgetError(budgetContent.validationError);
      return;
    }
    setBudget(next);
    rememberBudget(next);
    setFilters(false);
    setBudgetError("");
    reset();
  }

  return (
    <>
      <fieldset className="shopping-modes" aria-label="Shop by preparation">
        {[
          ["ALL", "All treats"],
          ["READY_TO_ORDER", "Ready to Order"],
          ["MADE_TO_ORDER", "Made to Order"],
          ["READY_TO_BAKE", "Ready to Bake"],
        ].map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              const url = new URL(window.location.href);
              url.searchParams.set("mode", value);
              window.history.replaceState(null, "", url);
              reset();
            }}
          >
            {label}
          </button>
        ))}
      </fieldset>
      {mode === "READY_TO_BAKE" && (
        <p className="shopping-mode-benefit">
          Fresh from your oven, without the prep. Prepared by Ndeelicious for baking at home, with storage and
          preparation instructions on each product.
        </p>
      )}
      <div className="catalogue-tools">
        <div className="catalogue-search">
          <Icon name="search" />
          <input
            aria-label={t("Search catalogue")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              reset();
            }}
            placeholder={t("Search the bakery")}
          />
        </div>
        <button type="button" className="button button-secondary mobile-only" onClick={() => setFilters(true)}>
          {t("Filters & budget")}
        </button>
        <label className="sort-control">
          <span>{t("Sort by")}</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value as Sort);
              reset();
            }}
          >
            <option value="featured">{t("Featured")}</option>
            <option value="newest">{t("Newest")}</option>
            <option value="low">{t("Price: low to high")}</option>
            <option value="high">{t("Price: high to low")}</option>
          </select>
        </label>
      </div>
      <div className={`catalogue-layout ${budget !== undefined ? "budget-active" : ""}`}>
        <aside className={`filters shop-filter-sidebar ${filters ? "is-open" : ""}`}>
          <div className="mobile-only panel-head">
            <h3>{t("Filters & budget")}</h3>
            <button
              type="button"
              className="icon-button"
              onClick={() => setFilters(false)}
              aria-label={t("Close filters")}
            >
              <Icon name="close" />
            </button>
          </div>
          <section className="sidebar-budget" aria-labelledby={"sidebar-budget-title"}>
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
                error={t(budgetError)}
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
                    rememberBudget(preset.maximum);
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
                  rememberBudget(undefined);
                  setBudgetInput("");
                  reset();
                }}
              >
                {budgetContent.clearLabel}
              </button>
            )}
          </section>
          <fieldset>
            <legend>{t("Category")}</legend>
            {[
              ["ALL", t("All treats")],
              ["PASTRIES", t("Fresh pastries")],
              ["READY_TO_BAKE", t("Ready to bake")],
              ["CUSTOM_CAKES", t("Celebration cakes")],
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
            <legend>{t("Availability")}</legend>
            <label>
              <input
                type="checkbox"
                checked={available}
                onChange={(event) => {
                  setAvailable(event.target.checked);
                  reset();
                }}
              />
              <span>{t("Available to order")}</span>
            </label>
          </fieldset>
          <button type="button" className="button button-primary mobile-only" onClick={() => setFilters(false)}>
            {t("Show")}
            {items.length} {t("products")}
          </button>
        </aside>
        <div className="catalogue-results">
          {budget !== undefined ? (
            <BudgetResults
              products={filteredProducts}
              sort={sort}
              maximum={budget}
              configuration={cakeConfiguration}
              clear={() => {
                setBudget(undefined);
                rememberBudget(undefined);
                setBudgetInput("");
                reset();
              }}
            />
          ) : (
            <>
              <p className="result-count">
                {items.length} {items.length === 1 ? t("treat") : t("treats")}
                {budget !== undefined ? t(" within {value1}", { value1: money(budget) }) : ""}
              </p>
              {items.length ? (
                <>
                  <ProductGrid items={visible} />
                  <Pagination page={page} pages={Math.ceil(items.length / perPage)} onChange={setPage} />
                </>
              ) : (
                <EmptyState
                  title={t("Nothing matched that search")}
                  body={
                    closest.length
                      ? `${budgetContent.closestPrefix} ${money(availableProductPrice(closest[0]))}.`
                      : "Try a broader search, another budget, or clear your filters."
                  }
                  action={
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => {
                        if (closest.length) {
                          const next = availableProductPrice(closest.at(-1) ?? closest[0]);
                          setBudget(next);
                          rememberBudget(next);
                          setFilters(false);
                          setBudgetInput(String(next / 100));
                        } else {
                          setQuery("");
                          setCategory("ALL");
                          setAvailable(false);
                          setBudget(undefined);
                          rememberBudget(undefined);
                          setBudgetInput("");
                        }
                        reset();
                      }}
                    >
                      {closest.length ? budgetContent.raiseBudgetLabel : "Clear filters"}
                    </button>
                  }
                />
              )}
            </>
          )}
        </div>
      </div>
      {filters && (
        <button
          type="button"
          className="scrim mobile-only"
          onClick={() => setFilters(false)}
          aria-label={t("Close filters")}
        />
      )}
    </>
  );
}
