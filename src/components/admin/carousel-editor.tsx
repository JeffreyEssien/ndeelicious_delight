"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ProductCarousel } from "@/components/product/product-carousel";
import { Button, Checkbox, Input, Select, Textarea } from "@/components/ui/primitives";
import { useMoney, useToast } from "@/components/providers";
import type { Product } from "@/types";
import type { StoreCarousel } from "@/types/content";

export function CarouselEditor({ products, initial }: { products: Product[]; initial: StoreCarousel }) {
  const [draft, setDraft] = useState(initial);
  const [published, setPublished] = useState(initial);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const notify = useToast();
  const money = useMoney();
  const dirty = JSON.stringify(draft) !== JSON.stringify(published);
  const selected = draft.productIds.flatMap((id) => {
    const product = products.find((item) => item.id === id);
    return product ? [product] : [];
  });
  const available = useMemo(
    () =>
      products.filter(
        (product) =>
          !draft.productIds.includes(product.id) &&
          product.status === "ACTIVE" &&
          `${product.name} ${product.sku ?? ""}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [draft.productIds, products, query],
  );
  const patch = (value: Partial<StoreCarousel>) => setDraft((current) => ({ ...current, ...value }));
  const move = (at: number, direction: -1 | 1) => {
    const next = [...draft.productIds];
    const destination = at + direction;
    if (destination < 0 || destination >= next.length) return;
    [next[at], next[destination]] = [next[destination], next[at]];
    patch({ productIds: next });
  };
  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    setSaveError("");
    const response = await fetch("/api/admin/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "settings", key: "carousel", value: draft }),
    });
    setBusy(false);
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setPublished(draft);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      notify("Homepage carousel published.");
    } else setSaveError(payload?.error ?? "Carousel settings could not be saved.");
  }
  return (
    <div className="carousel-editor">
      <section className="admin-card carousel-builder">
        <div className="card-head">
          <div>
            <h2>Carousel content</h2>
            <p>Choose the story, products, order, and customer actions.</p>
          </div>
          <label className="labeled-switch">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
            <span>Shown on homepage</span>
          </label>
        </div>
        <div className="carousel-fields">
          <Input label="Small heading" value={draft.eyebrow} onChange={(e) => patch({ eyebrow: e.target.value })} />
          <Input label="Main heading" value={draft.headline} onChange={(e) => patch({ headline: e.target.value })} />
          <Textarea
            className="field-wide"
            label="Introduction"
            rows={3}
            value={draft.body}
            onChange={(e) => patch({ body: e.target.value })}
          />
          <Select
            label="Layout style"
            value={draft.style}
            onChange={(e) => patch({ style: e.target.value as StoreCarousel["style"] })}
          >
            <option value="editorial">Editorial split</option>
            <option value="cards">Soft cards</option>
            <option value="spotlight">Dramatic spotlight</option>
          </Select>
          <details className="carousel-advanced field-wide">
            <summary>Advanced display and movement</summary>
            <div className="carousel-advanced-fields">
              <Checkbox
                label="Move through products automatically"
                checked={draft.autoplay}
                onChange={(e) => patch({ autoplay: e.target.checked })}
              />
              <Select
                label="Slide timing"
                value={draft.intervalMs}
                onChange={(e) => patch({ intervalMs: Number(e.target.value) })}
                disabled={!draft.autoplay}
              >
                <option value={6000}>6 seconds</option>
                <option value={8000}>8 seconds</option>
                <option value={12000}>12 seconds</option>
              </Select>
              <Checkbox
                label="Loop back to the first product"
                checked={draft.loop}
                onChange={(e) => patch({ loop: e.target.checked })}
              />
              <Checkbox
                label="Show current prices"
                checked={draft.showPrices}
                onChange={(e) => patch({ showPrices: e.target.checked })}
              />
              <Checkbox
                label="Show the basket action"
                checked={draft.showAddToCart}
                onChange={(e) => patch({ showAddToCart: e.target.checked })}
              />
            </div>
          </details>
        </div>
        <div className="carousel-product-editor">
          <div>
            <h3>
              Selected products <small>{selected.length}/12</small>
            </h3>
            <p>Drag-free ordering keeps this easy on phones: use the arrows to arrange the slides.</p>
            {selected.length > 6 && (
              <p className="carousel-recommendation">
                For a calmer storefront, 4–6 products is recommended. Your {selected.length} saved products will still
                work.
              </p>
            )}
          </div>
          <div className="carousel-selected-list">
            {selected.map((product, index) => (
              <article key={product.id}>
                <span>{index + 1}</span>
                <div className="carousel-admin-thumb">
                  {product.image ? <Image src={product.image} alt="" fill sizes="56px" /> : null}
                </div>
                <div>
                  <b>{product.name}</b>
                  <small>
                    {money(product.discountPrice ?? product.price)} · {product.status.replaceAll("_", " ")}
                  </small>
                </div>
                <div className="carousel-order-buttons">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${product.name} earlier`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === selected.length - 1}
                    aria-label={`Move ${product.name} later`}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ productIds: draft.productIds.filter((id) => id !== product.id) })}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
            {!selected.length && <p className="carousel-empty">Choose at least one published product below.</p>}
          </div>
          <Input
            label="Find a product to add"
            type="search"
            placeholder="Search name or SKU"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="carousel-product-picker">
            {available.slice(0, 12).map((product) => (
              <button
                type="button"
                key={product.id}
                disabled={draft.productIds.length >= 12}
                onClick={() => patch({ productIds: [...draft.productIds, product.id] })}
              >
                <b>{product.name}</b>
                <small>
                  {money(product.discountPrice ?? product.price)} · {product.status.replaceAll("_", " ")}
                </small>
                <span>+ Add</span>
              </button>
            ))}
          </div>
        </div>
        <div className="admin-save-bar">
          <p className={saveError ? "save-error" : ""}>
            {saveError ||
              (busy ? "Publishing…" : dirty ? "Unsaved changes" : savedAt ? `Published at ${savedAt}` : "Published")}
          </p>
          <Button onClick={save} disabled={busy || !dirty || (draft.enabled && !draft.productIds.length)}>
            {busy ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </section>
      <section className="carousel-preview admin-card">
        <div className="card-head">
          <div>
            <h2>Live preview</h2>
            <p>This uses the same component customers will see.</p>
          </div>
        </div>
        <ProductCarousel products={products} settings={{ ...draft, enabled: true }} preview />
      </section>
    </div>
  );
}
