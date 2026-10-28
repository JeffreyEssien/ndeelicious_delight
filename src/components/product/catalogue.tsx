"use client";
import { useSearchParams } from "next/navigation";
import { useCustomerText } from "@/components/customer-text-provider";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useBusinessSettings, useMoney, useProducts } from "@/components/providers";
import { BudgetResults } from "./budget-results";
import { productStartingPrice, shoppingMode } from "@/features/catalog/pricing";
import { type ShoppingMode, shoppingModeLabels } from "@/features/catalog/shop-filters";
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
import type { Category, Collection } from "@/types";
import type { CakeConfigurationData, StorefrontContent } from "@/types/content";

type Sort = "featured" | "newest" | "low" | "high";

export function Catalogue({
  initialCategory,
  initialMode,
  maximumPrice,
  cakeConfiguration,
  budgetContent,
  collections = [],
  initialCollection,
}: {
  initialCategory?: Category;
  initialMode?: ShoppingMode;
  maximumPrice?: number;
  cakeConfiguration: CakeConfigurationData;
  budgetContent: StorefrontContent["shopBudget"];
  collections?: Collection[];
  initialCollection?: string;
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
  const [collection, setCollection] = useState<string>(initialCollection ?? "ALL");
  const [mode, setMode] = useState<ShoppingMode | undefined>(initialMode);
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
  const cheapest = useMemo(
    () => Math.min(...products.filter(isProductPurchasable).map(availableProductPrice)),
    [products],
  );
  const budgetSection = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // On phones and tablets the filters and budget slide in as a drawer; Escape closes it.
  useEffect(() => {
    if (!filters) return;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => event.key === "Escape" && setFilters(false);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [filters]);
  const categories: Array<[Category | "ALL", string]> = [
    ["ALL", t("All treats")],
    ["PASTRIES", t("Ready to order")],
    ["READY_TO_BAKE", t("Ready to bake")],
    ["CUSTOM_CAKES", t("Custom cakes")],
  ];
  function chooseCategory(value: Category | "ALL") {
    setCategory(value);
    setCollection("ALL");
    setMode(undefined);
    setPage(1);
  }
  function openBudget() {
    setFilters(true);
    // Wait for the drawer to slide in, then bring the budget to the top of it.
    window.setTimeout(() => {
      budgetSection.current?.scrollIntoView({ block: "start" });
      budgetSection.current?.querySelector("button")?.focus();
    }, 250);
  }
  const filteredProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          (category === "ALL" || product.category === category) &&
          (!mode || shoppingMode(product) === mode) &&
          (collection === "ALL" || product.collectionId === collection) &&
          (!available || isProductPurchasable(product)) &&
          `${product.name} ${product.shortDescription} ${product.description} ${product.category}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [category, mode, collection, available, query, products],
  );
  const items = useMemo(
    () =>
      [...(budget === undefined ? filteredProducts : productsInBudget(filteredProducts, budget))].sort((a, b) =>
        sort === "low"
          ? productStartingPrice(a) - productStartingPrice(b)
          : sort === "high"
            ? productStartingPrice(b) - productStartingPrice(a)
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
        <div className="catalogue-results">
          {/* Phones and tablets: one tap between categories, right above the products. */}
          <fieldset className="catalogue-chips">
            <legend className="sr-only">{t("Category")}</legend>
            {categories.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={category === value ? "active" : ""}
                aria-pressed={category === value}
                onClick={() => chooseCategory(value)}
              >
                {label}
              </button>
            ))}
          </fieldset>
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
                {mode && (
                  <>
                    {" · "}
                    {t(shoppingModeLabels[mode])}{" "}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setMode(undefined);
                        reset();
                      }}
                    >
                      {t("Show all")}
                    </button>
                  </>
                )}
              </p>
              {items.length ? (
                <>
                  <ProductGrid items={visible} />
                  <Pagination page={page} pages={Math.ceil(items.length / perPage)} onChange={setPage} />
                  {/* The budget finder as a side attraction under the products (phones and tablets). */}
                  {presets.length > 0 && Number.isFinite(cheapest) && (
                    <aside className="budget-teaser">
                      <div>
                        <b>{budgetContent.headline}</b>
                        <span>{t("Treats from {value1}", { value1: money(cheapest) })}</span>
                      </div>
                      <button type="button" className="button button-secondary" onClick={openBudget}>
                        {t("Set a budget")} <Icon name="arrow" />
                      </button>
                    </aside>
                  )}
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
                          setCollection("ALL");
                          setMode(undefined);
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
        {/* Filters and the budget finder: a sidebar beside the products, or a drawer on smaller screens. */}
        <aside className={`filters shop-filter-sidebar ${filters ? "is-open" : ""}`}>
          <div className="mobile-only panel-head">
            <h3>{t("Filters & budget")}</h3>
            <button
              ref={closeButton}
              type="button"
              className="icon-button"
              onClick={() => setFilters(false)}
              aria-label={t("Close filters")}
            >
              <Icon name="close" />
            </button>
          </div>
          <section ref={budgetSection} className="sidebar-budget" aria-labelledby={"sidebar-budget-title"}>
            <h3 id="sidebar-budget-title">{budgetContent.headline}</h3>
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
                    setFilters(false);
                    reset();
                  }}
                >
                  {budgetContent.upToLabel} {money(preset.maximum)}
                </button>
              ))}
            </div>
            <form onSubmit={applyBudget} className="sidebar-budget-form">
              <p className="sidebar-budget-or">{t("Or enter your own amount")}</p>
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
            {categories.map(([value, label]) => (
              <label key={value}>
                <input
                  type="radio"
                  name="category"
                  checked={category === value}
                  onChange={() => chooseCategory(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {category !== "ALL" && collections.some((item) => item.parent === category) && (
            <fieldset>
              <legend>{t("Sub-category")}</legend>
              <label>
                <input
                  type="radio"
                  name="collection"
                  checked={collection === "ALL"}
                  onChange={() => {
                    setCollection("ALL");
                    reset();
                  }}
                />
                <span>{t("All")}</span>
              </label>
              {collections
                .filter((item) => item.parent === category)
                .map((item) => (
                  <label key={item.id}>
                    <input
                      type="radio"
                      name="collection"
                      checked={collection === item.id}
                      onChange={() => {
                        setCollection(item.id);
                        reset();
                      }}
                    />
                    <span>{item.name}</span>
                  </label>
                ))}
            </fieldset>
          )}
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
