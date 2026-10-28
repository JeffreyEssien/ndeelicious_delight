"use client";

import { useMemo, useState } from "react";
import { ImageUrlField } from "@/components/admin/image-url-field";
import { HeroShowcase } from "@/components/layout/hero-showcase";
import { useMoney, useToast } from "@/components/providers";
import { Button, Checkbox, Input, Select, Textarea } from "@/components/ui/primitives";
import { resolveHeroSlides } from "@/features/catalog/hero-slides";
import type { Product } from "@/types";
import type { StoreHero, StoreHeroSlide } from "@/types/content";

const MAX_SLIDES = 8;
const MAX_PERKS = 6;

const blankSlide = (): StoreHeroSlide => ({
  id: crypto.randomUUID(),
  image: "",
  imageAlt: "",
  label: "",
  eyebrow: "",
  headline: "",
  body: "",
  productSlugs: [],
  showPrice: true,
  priceNote: "",
  primaryLabel: "Order now",
  primaryHref: "",
  secondaryLabel: "",
  secondaryHref: "",
});

// What stops a draft from being published, in the owner's words; empty when it is ready.
function problems(draft: StoreHero) {
  const found: string[] = [];
  for (const [index, slide] of draft.slides.entries()) {
    const missing = [
      !slide.image.trim() && "an image",
      !slide.headline.trim() && "a headline",
      !slide.primaryLabel.trim() && "a button label",
    ].filter(Boolean);
    if (missing.length) found.push(`Slide ${index + 1} needs ${missing.join(" and ")}.`);
  }
  return found;
}

// Picks the products whose live price and order link a slide uses. Stored by slug.
function SlideProducts({
  slide,
  products,
  onChange,
}: {
  slide: StoreHeroSlide;
  products: Product[];
  onChange: (slugs: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const money = useMoney();
  const available = useMemo(
    () =>
      products.filter(
        (product) =>
          product.status === "ACTIVE" &&
          !slide.productSlugs.includes(product.slug) &&
          `${product.name} ${product.sku ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [products, query, slide.productSlugs],
  );
  return (
    <div className="hero-slide-products field-wide">
      <span className="hero-slide-products-title">Products on this slide</span>
      <p className="field-hint">
        Their live price shows on the slide (the lowest, marked “From”, when there are several). With one product, the
        button goes straight to its page.
      </p>
      {slide.productSlugs.length ? (
        <ul className="hero-slide-chips">
          {slide.productSlugs.map((slug) => {
            const product = products.find((item) => item.slug === slug);
            // Only a published product supplies a price; anything else is flagged.
            const onSale = product?.status === "ACTIVE" ? product : undefined;
            return (
              <li key={slug} className={onSale ? "" : "is-missing"}>
                <span>
                  {product?.name ?? slug}
                  {onSale ? ` · ${money(onSale.discountPrice ?? onSale.price)}` : " · not on sale"}
                </span>
                <button
                  type="button"
                  onClick={() => onChange(slide.productSlugs.filter((item) => item !== slug))}
                  aria-label={`Remove ${product?.name ?? slug} from this slide`}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hero-slide-empty">No products yet: the slide shows no price.</p>
      )}
      <Input
        label="Find a product to add"
        type="search"
        placeholder="Search name or SKU"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.trim() && (
        <div className="carousel-product-picker">
          {available.slice(0, 8).map((product) => (
            <button
              type="button"
              key={product.id}
              disabled={slide.productSlugs.length >= 12}
              onClick={() => {
                onChange([...slide.productSlugs, product.slug]);
                setQuery("");
              }}
            >
              <b>{product.name}</b>
              <small>{money(product.discountPrice ?? product.price)}</small>
              <span>+ Add</span>
            </button>
          ))}
          {!available.length && <p className="carousel-empty">No matching products on sale.</p>}
        </div>
      )}
    </div>
  );
}

// Admin → Homepage → Hero slides: every slide and every word of the homepage hero.
export function HeroEditor({ products, initial }: { products: Product[]; initial: StoreHero }) {
  const [draft, setDraft] = useState(initial);
  const [published, setPublished] = useState(initial);
  const [openId, setOpenId] = useState<string | null>(initial.slides[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const notify = useToast();
  const dirty = JSON.stringify(draft) !== JSON.stringify(published);
  const blocking = problems(draft);
  const previewSlides = useMemo(
    () => resolveHeroSlides({ ...draft, slides: draft.slides.filter((slide) => slide.image.trim()) }, products),
    [draft, products],
  );

  const patch = (value: Partial<StoreHero>) => setDraft((current) => ({ ...current, ...value }));
  const patchSlide = (id: string, value: Partial<StoreHeroSlide>) =>
    setDraft((current) => ({
      ...current,
      slides: current.slides.map((slide) => (slide.id === id ? { ...slide, ...value } : slide)),
    }));
  const moveSlide = (index: number, direction: -1 | 1) =>
    setDraft((current) => {
      const slides = [...current.slides];
      const destination = index + direction;
      if (destination < 0 || destination >= slides.length) return current;
      [slides[index], slides[destination]] = [slides[destination], slides[index]];
      return { ...current, slides };
    });

  async function save() {
    if (!dirty || busy || blocking.length) return;
    setBusy(true);
    setSaveError("");
    const response = await fetch("/api/admin/mutate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "settings", key: "hero", value: draft }),
    }).catch(() => null);
    setBusy(false);
    const payload = await response?.json().catch(() => null);
    if (response?.ok) {
      setPublished(draft);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      notify("Homepage hero published.");
    } else setSaveError(payload?.error ?? "The hero could not be saved. Check your connection and try again.");
  }

  return (
    <div className="carousel-editor hero-editor">
      <section className="admin-card carousel-builder">
        <div className="card-head">
          <div>
            <h2>Hero slides</h2>
            <p>The rotating showcase at the very top of the homepage: pictures, words, prices and buttons.</p>
          </div>
        </div>
        <ol className="hero-slide-list">
          {draft.slides.map((slide, index) => (
            <li key={slide.id}>
              <details
                className="hero-slide-card"
                open={openId === slide.id}
                onToggle={(event) => {
                  const isOpen = event.currentTarget.open;
                  setOpenId((current) => (isOpen ? slide.id : current === slide.id ? null : current));
                }}
              >
                <summary>
                  <span className="hero-slide-number">{index + 1}</span>
                  <span className="hero-slide-summary">
                    <b>{slide.label || slide.headline.replace(/\s+/g, " ") || "New slide"}</b>
                    <small>
                      {slide.productSlugs.length
                        ? `${slide.productSlugs.length} product${slide.productSlugs.length === 1 ? "" : "s"}`
                        : "No products"}
                      {!slide.image && " · needs an image"}
                    </small>
                  </span>
                </summary>
                <div className="carousel-fields">
                  <div className="field-wide">
                    <ImageUrlField
                      label="Image"
                      value={slide.image}
                      onChange={(image) => patchSlide(slide.id, { image })}
                      onChooseItem={(item) => {
                        if (!slide.imageAlt.trim() && item.altText) patchSlide(slide.id, { imageAlt: item.altText });
                      }}
                      hint="Portrait images (about 4:5) look best. The background takes on the image’s colours."
                    />
                  </div>
                  <Input
                    label="Image description (for screen readers)"
                    value={slide.imageAlt}
                    onChange={(event) => patchSlide(slide.id, { imageAlt: event.target.value })}
                  />
                  <Input
                    label="Slide name (for the slide dots)"
                    placeholder="e.g. Chicken pies"
                    value={slide.label}
                    onChange={(event) => patchSlide(slide.id, { label: event.target.value })}
                  />
                  <Input
                    label="Small heading"
                    value={slide.eyebrow}
                    onChange={(event) => patchSlide(slide.id, { eyebrow: event.target.value })}
                  />
                  <Textarea
                    label="Headline (press Enter for a new line)"
                    rows={3}
                    value={slide.headline}
                    onChange={(event) => patchSlide(slide.id, { headline: event.target.value })}
                  />
                  <Textarea
                    className="field-wide"
                    label="Description"
                    rows={3}
                    value={slide.body}
                    onChange={(event) => patchSlide(slide.id, { body: event.target.value })}
                  />
                  <SlideProducts
                    slide={slide}
                    products={products}
                    onChange={(productSlugs) => patchSlide(slide.id, { productSlugs })}
                  />
                  <Checkbox
                    label="Show the price"
                    checked={slide.showPrice}
                    onChange={(event) => patchSlide(slide.id, { showPrice: event.target.checked })}
                  />
                  <Input
                    label="Text after the price"
                    placeholder="e.g. per box, 6 pies"
                    value={slide.priceNote}
                    disabled={!slide.showPrice}
                    onChange={(event) => patchSlide(slide.id, { priceNote: event.target.value })}
                  />
                  <Input
                    label="Button label"
                    value={slide.primaryLabel}
                    onChange={(event) => patchSlide(slide.id, { primaryLabel: event.target.value })}
                  />
                  <Input
                    label="Button link"
                    placeholder={
                      slide.productSlugs.length === 1 ? "Empty: the product’s page" : "e.g. /ready-to-bake or /shop"
                    }
                    value={slide.primaryHref}
                    onChange={(event) => patchSlide(slide.id, { primaryHref: event.target.value.trim() })}
                  />
                  <Input
                    label="Second link text (optional)"
                    placeholder="e.g. See the full range"
                    value={slide.secondaryLabel}
                    onChange={(event) => patchSlide(slide.id, { secondaryLabel: event.target.value })}
                  />
                  <Input
                    label="Second link destination"
                    placeholder="e.g. /ready-to-bake"
                    value={slide.secondaryHref}
                    onChange={(event) => patchSlide(slide.id, { secondaryHref: event.target.value.trim() })}
                  />
                </div>
                <div className="hero-slide-actions">
                  <button type="button" onClick={() => moveSlide(index, -1)} disabled={index === 0}>
                    ↑ Move earlier
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSlide(index, 1)}
                    disabled={index === draft.slides.length - 1}
                  >
                    ↓ Move later
                  </button>
                  <button
                    type="button"
                    className="is-danger"
                    disabled={draft.slides.length === 1}
                    onClick={() => patch({ slides: draft.slides.filter((item) => item.id !== slide.id) })}
                  >
                    Remove slide
                  </button>
                </div>
              </details>
            </li>
          ))}
        </ol>
        <div className="hero-slide-add">
          <Button
            variant="secondary"
            disabled={draft.slides.length >= MAX_SLIDES}
            onClick={() => {
              const slide = blankSlide();
              patch({ slides: [...draft.slides, slide] });
              setOpenId(slide.id);
            }}
          >
            + Add a slide
          </Button>
          <small>
            {draft.slides.length}/{MAX_SLIDES} slides
          </small>
        </div>
        <div className="carousel-fields hero-shared-fields">
          <fieldset className="hero-perks-editor field-wide">
            <legend>Perks row (under the hero)</legend>
            {draft.perks.map((perk, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: perks are plain strings and every input is controlled.
              <div key={index} className="hero-perk-row">
                <input
                  aria-label={`Perk ${index + 1}`}
                  value={perk}
                  maxLength={60}
                  onChange={(event) =>
                    patch({ perks: draft.perks.map((item, at) => (at === index ? event.target.value : item)) })
                  }
                />
                <button
                  type="button"
                  onClick={() => patch({ perks: draft.perks.filter((_, at) => at !== index) })}
                  aria-label={`Remove perk ${index + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="hero-perk-add"
              disabled={draft.perks.length >= MAX_PERKS}
              onClick={() => patch({ perks: [...draft.perks, ""] })}
            >
              + Add a perk
            </button>
          </fieldset>
          <Input
            label="Word before a starting price"
            value={draft.fromLabel}
            onChange={(event) => patch({ fromLabel: event.target.value })}
          />
          <Select
            label="Slide timing"
            value={draft.intervalMs}
            onChange={(event) => patch({ intervalMs: Number(event.target.value) })}
          >
            {[4, 5, 6, 8, 10, 12].map((seconds) => (
              <option key={seconds} value={seconds * 1000}>
                {seconds} seconds
              </option>
            ))}
          </Select>
          <Input
            className="field-wide"
            label="Name of the showcase (read out by screen readers)"
            value={draft.label}
            onChange={(event) => patch({ label: event.target.value })}
          />
        </div>
        <div className="admin-save-bar">
          <p className={saveError || (dirty && blocking.length) ? "save-error" : ""}>
            {saveError ||
              (dirty && blocking.length
                ? blocking[0]
                : busy
                  ? "Publishing…"
                  : dirty
                    ? "Unsaved changes"
                    : savedAt
                      ? `Published at ${savedAt}`
                      : "Published")}
          </p>
          <Button onClick={save} disabled={busy || !dirty || blocking.length > 0}>
            {busy ? "Publishing…" : "Publish"}
          </Button>
        </div>
      </section>
      <section className="carousel-preview hero-preview admin-card">
        <div className="card-head">
          <div>
            <h2>Hero preview</h2>
            <p>This uses the same component customers will see.</p>
          </div>
        </div>
        {previewSlides.length ? (
          <HeroShowcase
            slides={previewSlides}
            label={draft.label}
            fromLabel={draft.fromLabel}
            perks={draft.perks.filter((perk) => perk.trim())}
            intervalMs={draft.intervalMs}
          />
        ) : (
          <p className="carousel-empty">Add an image to a slide to see the preview.</p>
        )}
      </section>
    </div>
  );
}
