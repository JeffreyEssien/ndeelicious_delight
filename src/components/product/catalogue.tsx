"use client";
import { useMemo, useState } from "react";
import { useProducts } from "@/components/providers";
import type { Category } from "@/types";
import { ProductGrid } from "./product-grid";
import { Icon } from "@/components/ui/icons";
import { EmptyState, Pagination } from "@/components/ui/primitives";

type Sort = "featured" | "newest" | "low" | "high";
export function Catalogue({ initialCategory }: { initialCategory?: Category }) {
  const products = useProducts();
  const [category, setCategory] = useState<Category | "ALL">(initialCategory ?? "ALL");
  const [available, setAvailable] = useState(false);
  const [sort, setSort] = useState<Sort>("featured");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 6;
  const items = useMemo(
    () =>
      products
        .filter(
          (p) =>
            (category === "ALL" || p.category === category) &&
            (!available || p.status === "ACTIVE") &&
            `${p.name} ${p.shortDescription}`.toLowerCase().includes(query.toLowerCase()),
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
    [category, available, sort, query, products],
  );
  const visible = items.slice((page - 1) * perPage, page * perPage);
  const reset = () => setPage(1);
  return (
    <>
      <div className="catalogue-tools">
        <div className="catalogue-search">
          <Icon name="search" />
          <input
            aria-label="Search catalogue"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              reset();
            }}
            placeholder="Search the bakery"
          />
        </div>
        <button type="button" className="button button-secondary mobile-only" onClick={() => setFilters(true)}>
          Filters
        </button>
        <label className="sort-control">
          <span>Sort by</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
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
        <aside className={`filters ${filters ? "is-open" : ""}`}>
          <div className="mobile-only panel-head">
            <h3>Filters</h3>
            <button type="button" className="icon-button" onClick={() => setFilters(false)}>
              <Icon name="close" />
            </button>
          </div>
          <fieldset>
            <legend>Category</legend>
            {[
              ["ALL", "All treats"],
              ["PASTRIES", "Fresh pastries"],
              ["READY_TO_BAKE", "Ready to bake"],
              ["CUSTOM_CAKES", "Celebration cakes"],
            ].map(([v, l]) => (
              <label key={v}>
                <input
                  type="radio"
                  name="category"
                  checked={category === v}
                  onChange={() => {
                    setCategory(v as Category | "ALL");
                    reset();
                  }}
                />
                <span>{l}</span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Availability</legend>
            <label>
              <input
                type="checkbox"
                checked={available}
                onChange={(e) => {
                  setAvailable(e.target.checked);
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
          </p>
          {items.length ? (
            <>
              <ProductGrid items={visible} />
              <Pagination page={page} pages={Math.ceil(items.length / perPage)} onChange={setPage} />
            </>
          ) : (
            <EmptyState
              title="Nothing matched that search"
              body="Try a broader search or clear your filters."
              action={
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setQuery("");
                    setCategory("ALL");
                    setAvailable(false);
                  }}
                >
                  Clear filters
                </button>
              }
            />
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
