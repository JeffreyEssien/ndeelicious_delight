"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useState } from "react";
import type { CakeSizeLayer, Product, ProductImage, ProductStatus, ProductVariant } from "@/types";
import { Button, Checkbox, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { normalizeCakeSizeLayers, variantPrice } from "@/features/catalog/pricing";
import { useBusinessSettings } from "@/components/providers";

type DraftVariant = Omit<ProductVariant, "id"> & {
  id?: string;
  key: string;
  sellingPrice: number;
  expectedStockQuantity?: number;
  layerOptions?: CakeSizeLayer[];
};
type PendingImage = { key: string; file: File; altText: string };
type DraftOptionGroup = { key: string; id: string; name: string; choicesText: string; required: boolean };

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Vercel's Hobby plan rejects request bodies over 4.5 MB before they reach the function, so cap
// image uploads safely below that (multipart adds some overhead) to avoid a plain-text 413.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

// Infrastructure in front of the app (e.g. Vercel's body-size cap) can reply with plain text such as
// "Request Entity Too Large" instead of JSON. Read the body as text first so those responses surface a
// real message rather than an "Unexpected token" JSON parse crash.
async function readJsonResponse(response: Response): Promise<{ error?: string; [key: string]: unknown }> {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const message =
      response.status === 413
        ? "That upload was too large for the server. Use an image under 4 MB."
        : `The server returned an unexpected response (${response.status}). Please try again.`;
    return { error: message };
  }
}

export function ProductEditor({
  product,
  close,
  onSaved,
  flavourLibrary: initialFlavours = [],
  fillingLibrary: initialFillings = [],
  sizeLibrary: initialSizes = [],
}: {
  product: Product | null;
  close: () => void;
  onSaved: (updated: Partial<Product>) => void;
  flavourLibrary?: string[];
  fillingLibrary?: string[];
  sizeLibrary?: { name: string; price: number }[];
}) {
  const { currency } = useBusinessSettings();
  // The libraries arrive as a page-load snapshot; refetch them when the editor opens so new
  // flavours, fillings and sizes added in "Sizes, flavours and cake options" show up here.
  const [flavourLibrary, setFlavourLibrary] = useState(initialFlavours);
  const [fillingLibrary, setFillingLibrary] = useState(initialFillings);
  const [sizeLibrary, setSizeLibrary] = useState(initialSizes);
  useEffect(() => {
    fetch("/api/admin/cake-options", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload) return;
        setFlavourLibrary(payload.flavours ?? []);
        setFillingLibrary(payload.fillings ?? []);
        setSizeLibrary(payload.sizes ?? []);
      })
      .catch(() => {});
  }, []);
  const initialPreparationUnit =
    product?.preparationHours && Number.isInteger(product.preparationHours) ? "hours" : "minutes";
  const [preparationUnit, setPreparationUnit] = useState(initialPreparationUnit);
  const [preparationValue, setPreparationValue] = useState(
    String(
      initialPreparationUnit === "minutes"
        ? Math.round((product?.preparationHours ?? 0) * 60)
        : (product?.preparationHours ?? 0),
    ),
  );
  // Cakes express their buffer as a whole number of lead-time days, stored as prep hours
  // (days × 24) so scheduling keeps working unchanged.
  const [leadTimeDays, setLeadTimeDays] = useState(
    String(Math.max(0, Math.round((product?.preparationHours ?? 0) / 24))),
  );
  const [price, setPrice] = useState(String((product?.price ?? 0) / 100));
  const [discount, setDiscount] = useState(
    product?.discountPrice === undefined ? "" : String(product.discountPrice / 100),
  );
  const [editingPack, setEditingPack] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(product?.category ?? "PASTRIES");
  // Behaviour follows the category: Ready to bake is bake-at-home, everything else is made to order.
  const mode = category === "READY_TO_BAKE" ? "READY_TO_BAKE" : "MADE_TO_ORDER";
  // Cakes are made-to-order but sold by size (the "pack quantity" is the serving count).
  const isCake = category === "CUSTOM_CAKES";
  const [collectionId, setCollectionId] = useState(product?.collectionId ?? "");
  const [collections, setCollections] = useState<{ id: string; parent: string; name: string }[]>([]);
  useEffect(() => {
    fetch("/api/admin/collections", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { collections: [] }))
      .then((payload) => setCollections(payload.collections ?? []))
      .catch(() => {});
  }, []);
  const effectiveBase = Math.round(Number(discount || price) * 100);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState(product?.id ?? "");
  const [variants, setVariants] = useState<DraftVariant[]>(
    product
      ? product.variants.map((variant) => ({
          ...variant,
          key: variant.id,
          sellingPrice: variantPrice(product, variant),
          expectedStockQuantity: variant.stockQuantity,
          active: variant.active ?? true,
          layerOptions: normalizeCakeSizeLayers(product.cakeLayers?.[variant.id]),
        }))
      : [
          {
            id: crypto.randomUUID(),
            key: "standard",
            name: "Standard",
            sellingPrice: 0,
            priceAdjustment: 0,
            stockQuantity: 0,
            active: true,
          },
        ],
  );
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [optionGroups, setOptionGroups] = useState<DraftOptionGroup[]>(
    (product?.optionGroups ?? []).map((group) => ({
      key: group.id,
      id: group.id,
      name: group.name,
      choicesText: group.choices.join("\n"),
      required: group.required,
    })),
  );

  // Cakes pick their flavours/fillings from the shared library (stored as option groups named
  // "Flavour"/"Filling"); non-cakes keep the free-text option groups above.
  const initialGroupChoices = (name: string) =>
    product?.optionGroups?.find((group) => group.name === name)?.choices ?? [];
  const [cakeFlavours, setCakeFlavours] = useState<string[]>(initialGroupChoices("Flavour"));
  const [cakeFillings, setCakeFillings] = useState<string[]>(initialGroupChoices("Filling"));
  function toggleIn(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  function addOptionGroup() {
    setOptionGroups((current) => [
      ...current,
      { key: crypto.randomUUID(), id: crypto.randomUUID(), name: "", choicesText: "", required: true },
    ]);
  }
  function patchOptionGroup(index: number, patch: Partial<DraftOptionGroup>) {
    setOptionGroups((current) => current.map((group, i) => (i === index ? { ...group, ...patch } : group)));
  }
  function removeOptionGroup(index: number) {
    setOptionGroups((current) => current.filter((_, i) => i !== index));
  }

  function patchPack(index: number, patch: Partial<DraftVariant>) {
    setVariants((current) => current.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }
  function movePack(index: number, direction: -1 | 1) {
    setVariants((current) => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }

  function moveImage(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    setImages((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function uploadImages(productId: string, productName: string) {
    for (const [index, pending] of pendingImages.entries()) {
      const form = new FormData();
      form.set("productId", productId);
      form.set("file", pending.file);
      form.set("altText", pending.altText.trim() || productName);
      form.set("sortOrder", String(images.length + index));
      const response = await fetch("/api/admin/products/images", { method: "POST", body: form });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload.error ?? `Could not upload ${pending.file.name}.`);
      setImages((current) => [...current, payload.image as ProductImage]);
      setPendingImages((current) => current.filter((item) => item.key !== pending.key));
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name"));
    // Cakes store a lead-time buffer in days; ready-to-bake uses prep time; ready-to-order has none.
    const preparationHours = isCake
      ? Number(leadTimeDays || 0) * 24
      : category === "READY_TO_BAKE"
        ? Number(preparationValue || 0) / (preparationUnit === "minutes" ? 60 : 1)
        : 0;
    const payload = {
      name,
      slug: String(form.get("slug")) || slugify(name),
      shortDescription: String(form.get("shortDescription")),
      description: String(form.get("description")),
      category: String(form.get("category")),
      price: Math.round(Number(form.get("price")) * 100),
      discountPrice: form.get("discountPrice") ? Math.round(Number(form.get("discountPrice")) * 100) : null,
      status: String(form.get("status")) as ProductStatus,
      featured: form.get("featured") === "on",
      shoppingMode: mode,
      preparationHours,
      taxClass: String(form.get("taxClass")),
      trackInventory: form.get("trackInventory") === "on",
      lowStockThreshold: Number(form.get("lowStockThreshold")),
      ingredients: String(form.get("ingredients")),
      allergens: String(form.get("allergens"))
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      storageInstructions: String(form.get("storageInstructions")),
      preparationInstructions: String(form.get("preparationInstructions")),
      variants: variants.map((variant, index) => ({
        id: variant.id,
        name: variant.name,
        priceAdjustment: mode === "MADE_TO_ORDER" ? variant.sellingPrice - effectiveBase : variant.priceAdjustment,
        packQuantity: variant.packQuantity ?? null,
        stockQuantity: variant.stockQuantity,
        active: variant.active,
        sortOrder: index,
        trackInventory: variant.trackInventory ?? null,
        expectedStockQuantity: variant.expectedStockQuantity,
      })),
      images: images.map((image, index) => ({ id: image.id, altText: image.altText, sortOrder: index })),
      optionGroups: isCake
        ? [
            { id: "flavour", name: "Flavour", required: true, choices: cakeFlavours },
            { id: "filling", name: "Filling", required: true, choices: cakeFillings },
          ].filter((group) => group.choices.length)
        : optionGroups
            .map((group) => ({
              id: group.id,
              name: group.name.trim(),
              required: group.required,
              choices: group.choicesText
                .split("\n")
                .map((choice) => choice.trim())
                .filter(Boolean),
            }))
            .filter((group) => group.name && group.choices.length),
      cakeLayers: isCake
        ? Object.fromEntries(
            variants
              .filter((variant) => variant.id && normalizeCakeSizeLayers(variant.layerOptions).length)
              .map((variant) => [variant.id, normalizeCakeSizeLayers(variant.layerOptions)]),
          )
        : {},
      collectionId: collectionId || null,
    };

    try {
      const productId = savedId;
      const response = await fetch(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
        method: productId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);
      if (!response.ok) throw new Error(result.error ?? "Product could not be saved.");
      setSavedId(result.id as string);
      if (pendingImages.length) await uploadImages(result.id as string, name);
      onSaved({ preparationHours: payload.preparationHours });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Product could not be saved.");
      setBusy(false);
    }
  }

  return (
    <div className="product-editor-content">
      <div className="panel-head">
        <div>
          <span className="overline">Catalogue</span>
          <h2>{product ? "Edit product" : "Add product"}</h2>
        </div>
        <button type="button" className="icon-button" onClick={close} aria-label="Close product drawer">
          <Icon name="close" />
        </button>
      </div>
      <form onSubmit={submit} className="form-stack" aria-busy={busy}>
        <div className="product-editor-section">
          <h3>Basics</h3>
          <Input label="Product name" name="name" defaultValue={product?.name} required />
          <details>
            <summary>Product link</summary>
            <Input label="URL slug" name="slug" defaultValue={product?.slug} placeholder="Generated from the name" />
          </details>
          <Textarea
            label={isCake ? "Short description (optional)" : "Short description"}
            name="shortDescription"
            defaultValue={product?.shortDescription}
            rows={2}
            required={!isCake}
          />
          <Textarea
            label={isCake ? "Full description (optional)" : "Full description"}
            name="description"
            defaultValue={product?.description}
            rows={5}
            required={!isCake}
          />
          <Select
            label="Category"
            name="category"
            value={category}
            onChange={(event) => {
              const nextCategory = event.target.value;
              const oldMode = category === "READY_TO_BAKE" ? "READY_TO_BAKE" : "MADE_TO_ORDER";
              const newMode = nextCategory === "READY_TO_BAKE" ? "READY_TO_BAKE" : "MADE_TO_ORDER";
              if (newMode === "MADE_TO_ORDER" && oldMode !== newMode)
                setVariants((current) =>
                  current.map((v) => ({ ...v, sellingPrice: effectiveBase + v.priceAdjustment })),
                );
              if (oldMode === "MADE_TO_ORDER" && newMode !== oldMode)
                setVariants((current) =>
                  current.map((v) => ({ ...v, priceAdjustment: v.sellingPrice - effectiveBase })),
                );
              setCategory(nextCategory);
              setCollectionId("");
            }}
          >
            <option value="PASTRIES">Ready to order</option>
            <option value="READY_TO_BAKE">Ready to bake</option>
            <option value="CUSTOM_CAKES">Custom cakes</option>
          </Select>
          <label className="field">
            <span>Sub-category</span>
            <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
              <option value="">No sub-category</option>
              {collections
                .filter((collection) => collection.parent === category)
                .map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.name}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <div className="product-editor-section">
          <h3>Pricing & visibility</h3>
          <div className="field-row">
            <Input
              label={`Price (${currency})`}
              name="price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
            <Input
              label={`Sale price (${currency})`}
              name="discountPrice"
              type="number"
              min="0"
              step="0.01"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </div>
          <Select label="Storefront visibility" name="status" defaultValue={product?.status ?? "DRAFT"}>
            <option value="DRAFT">Draft — hidden</option>
            <option value="ACTIVE">Active — visible</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="ARCHIVED">Archived — hidden</option>
          </Select>
          <Checkbox label="Feature this product on the storefront" name="featured" defaultChecked={product?.featured} />
        </div>

        <div className="product-editor-section">
          <h3>Shopping &amp; preparation</h3>
          <Select label="Tax classification" name="taxClass" defaultValue={product?.taxClass ?? "REQUIRES_REVIEW"}>
            <option value="REQUIRES_REVIEW">Setup required</option>
            <option value="ZERO_RATED_GROCERY">Eligible basic grocery (zero rated)</option>
            <option value="SWEET_SINGLE_SERVING">Eligible sweet single servings (pack rule)</option>
            <option value="FULL_CAKE">Eligible full cake (zero rated)</option>
            <option value="WEDDING_CAKE">Eligible edible wedding cake (zero rated)</option>
            <option value="STANDARD_TAXABLE">Standard taxable</option>
          </Select>
          <p>
            Confirm CRA classification, serving size and packaging. Sweet servings qualify for the six-or-more rule only
            when sold together without individual taxable packaging.
          </p>
          {isCake ? (
            <>
              <Input
                label="Lead time (days)"
                type="number"
                min="0"
                step="1"
                value={leadTimeDays}
                onChange={(event) => setLeadTimeDays(event.target.value)}
                required
              />
              <p className="field-help">
                The buffer you need before a cake order is ready — the earliest pickup/delivery date is pushed out by
                this many days. Cakes are made to order, so there is no separate preparation time.
              </p>
            </>
          ) : category === "READY_TO_BAKE" ? (
            <>
              <Input
                label="Preparation time"
                type="number"
                min="0"
                max={preparationUnit === "minutes" ? 525600 : 8760}
                step={preparationUnit === "minutes" ? "1" : "any"}
                value={preparationValue}
                onChange={(event) => setPreparationValue(event.target.value)}
                required
              />
              <Select
                label="Preparation unit"
                value={preparationUnit}
                onChange={(event) => {
                  const unit = event.target.value === "hours" ? "hours" : "minutes";
                  setPreparationValue(String(Number(preparationValue) * (unit === "minutes" ? 60 : 1 / 60)));
                  setPreparationUnit(unit);
                }}
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </Select>
            </>
          ) : null}
          <h3>Inventory</h3>
          <Checkbox label="Track inventory" name="trackInventory" defaultChecked={product?.trackInventory ?? true} />
          <div className="field-row">
            <Input
              label="Total stock"
              value={variants
                .filter((variant) => variant.active)
                .reduce((sum, variant) => sum + variant.stockQuantity, 0)}
              readOnly
            />
            <Input
              label="Low-stock alert"
              name="lowStockThreshold"
              type="number"
              min="0"
              defaultValue={product?.lowStockThreshold ?? 5}
              required
            />
          </div>
        </div>

        <div className="product-editor-section">
          <div className="editor-section-head">
            <div>
              <h3>{isCake ? "Sizes" : mode === "MADE_TO_ORDER" ? "Pack options" : "Variants / packs"}</h3>
              <p className="field-help">
                {isCake
                  ? "Add each size and set its selling price. “Serves” is the guest count for that size."
                  : mode === "MADE_TO_ORDER"
                    ? "Choose any pack size and set its selling price. Stock is optional and counts packs, not pieces."
                    : "Manage product choices and their stock."}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const key = crypto.randomUUID();
                setVariants((current) => [
                  ...current,
                  {
                    id: key,
                    key,
                    name: "",
                    packQuantity: null,
                    sellingPrice: 0,
                    priceAdjustment: 0,
                    stockQuantity: 0,
                    active: false,
                    trackInventory: mode === "MADE_TO_ORDER" ? false : null,
                    layerOptions: isCake ? [{ layers: 1, priceAdjustment: 0 }] : undefined,
                  },
                ]);
                setEditingPack(key);
              }}
            >
              <Icon name="plus" />
              {isCake ? "Add size" : mode === "MADE_TO_ORDER" ? "Add pack" : "Add variant"}
            </Button>
          </div>
          {mode === "MADE_TO_ORDER" && !isCake && (
            <Button
              variant="secondary"
              onClick={() =>
                setVariants((current) => [
                  ...current,
                  ...[3, 6, 12]
                    .filter((size) => !current.some((v) => v.packQuantity === size))
                    .map((size) => ({
                      key: crypto.randomUUID(),
                      id: crypto.randomUUID(),
                      name: `Pack of ${size}`,
                      packQuantity: size,
                      sellingPrice: 0,
                      priceAdjustment: 0,
                      stockQuantity: 0,
                      active: false,
                      trackInventory: false,
                    })),
                ])
              }
            >
              Add common sizes
            </Button>
          )}
          {isCake && sizeLibrary.length > 0 && (
            <label className="size-library-picker">
              <span className="field-label">Add a size from your Flavours &amp; sizes library</span>
              <select
                value=""
                onChange={(event) => {
                  const picked = sizeLibrary.find((size) => size.name === event.target.value);
                  if (!picked) return;
                  const key = crypto.randomUUID();
                  setVariants((current) => [
                    ...current,
                    {
                      id: key,
                      key,
                      name: picked.name,
                      packQuantity: null,
                      sellingPrice: picked.price,
                      priceAdjustment: 0,
                      stockQuantity: 0,
                      active: false,
                      trackInventory: false,
                      layerOptions: [{ layers: 1, priceAdjustment: 0 }],
                    },
                  ]);
                  setEditingPack(key);
                }}
              >
                <option value="">Choose a size…</option>
                {sizeLibrary.map((size) => (
                  <option key={size.name} value={size.name}>
                    {size.name}
                  </option>
                ))}
              </select>
              <p className="field-help">
                Pick a size you keep in Flavours &amp; sizes, then set its price and how many layers it has.
              </p>
            </label>
          )}
          {!variants.length && (
            <p className="empty-state">
              {isCake
                ? "No sizes yet. Add a size, then enter its name and price before publishing."
                : "No packs yet. Add any size, then enter its name and price before publishing."}
            </p>
          )}
          {variants.map((variant, index) => (
            <div className="pack-editor-card" key={variant.key}>
              <div className="pack-editor-summary">
                <div>
                  <strong>{variant.name || "New pack"}</strong>
                  <p>
                    {variant.packQuantity
                      ? `${isCake ? "Serves " : ""}${variant.packQuantity}${isCake ? "" : " pieces"} · `
                      : isCake
                        ? "Serves not set · "
                        : "Size not set · "}
                    {currency}{" "}
                    {(mode === "MADE_TO_ORDER"
                      ? variant.sellingPrice / 100
                      : (effectiveBase + variant.priceAdjustment) / 100
                    ).toFixed(2)}{" "}
                    · {variant.active ? "Published" : "Unavailable"}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  aria-expanded={editingPack === variant.key}
                  onClick={() => setEditingPack(editingPack === variant.key ? null : variant.key)}
                >
                  {editingPack === variant.key ? "Done" : "Edit"}
                </Button>
              </div>
              {editingPack === variant.key && (
                <div className="pack-editor-fields">
                  <Input
                    label="Display name"
                    value={variant.name}
                    onChange={(event) => patchPack(index, { name: event.target.value })}
                    required
                  />
                  <div className="field-row">
                    <Input
                      label={isCake ? "Serves (guests)" : "Pieces per pack"}
                      type="number"
                      min="1"
                      step="1"
                      value={variant.packQuantity ?? ""}
                      onChange={(event) =>
                        patchPack(index, { packQuantity: event.target.value ? Number(event.target.value) : null })
                      }
                      required={mode === "MADE_TO_ORDER" && variant.active}
                    />
                    <Input
                      label={
                        mode === "MADE_TO_ORDER" ? `Selling price (${currency})` : `Price adjustment (${currency})`
                      }
                      type="number"
                      min={mode === "MADE_TO_ORDER" ? "0" : undefined}
                      step="0.01"
                      value={(mode === "MADE_TO_ORDER" ? variant.sellingPrice : variant.priceAdjustment) / 100}
                      onChange={(event) =>
                        patchPack(
                          index,
                          mode === "MADE_TO_ORDER"
                            ? { sellingPrice: Math.round(Number(event.target.value) * 100) }
                            : { priceAdjustment: Math.round(Number(event.target.value) * 100) },
                        )
                      }
                    />
                  </div>
                  {isCake && (
                    <fieldset className="cake-layer-options">
                      <legend>Available layers</legend>
                      <p className="field-help">
                        Tick each layer count this size can be made in. Set a price adjustment to charge more (or less)
                        for taller cakes — it is added to the size price above.
                      </p>
                      {[1, 2, 3, 4, 5, 6].map((count) => {
                        const option = variant.layerOptions?.find((entry) => entry.layers === count);
                        return (
                          <div className="cake-layer-row" key={count}>
                            <Checkbox
                              label={`${count} ${count === 1 ? "layer" : "layers"}`}
                              checked={Boolean(option)}
                              onChange={(event) =>
                                patchPack(index, {
                                  layerOptions: event.target.checked
                                    ? [...(variant.layerOptions ?? []), { layers: count, priceAdjustment: 0 }]
                                    : (variant.layerOptions ?? []).filter((entry) => entry.layers !== count),
                                })
                              }
                            />
                            {option && (
                              <Input
                                label={`Price adjustment (${currency})`}
                                type="number"
                                step="0.01"
                                value={option.priceAdjustment / 100}
                                onChange={(event) =>
                                  patchPack(index, {
                                    layerOptions: (variant.layerOptions ?? []).map((entry) =>
                                      entry.layers === count
                                        ? { ...entry, priceAdjustment: Math.round(Number(event.target.value) * 100) }
                                        : entry,
                                    ),
                                  })
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                    </fieldset>
                  )}
                  <Checkbox
                    label="Published (available to customers)"
                    checked={variant.active ?? true}
                    onChange={(event) => patchPack(index, { active: event.target.checked })}
                  />
                  <details open>
                    <summary>Inventory & SKU</summary>
                    <Checkbox
                      label="Track stock for this pack"
                      checked={variant.trackInventory ?? product?.trackInventory ?? true}
                      onChange={(event) => patchPack(index, { trackInventory: event.target.checked })}
                    />
                    {(variant.trackInventory ?? product?.trackInventory ?? true) && (
                      <Input
                        label="Stock (available packs)"
                        type="number"
                        min="0"
                        step="1"
                        value={variant.stockQuantity}
                        onChange={(event) => patchPack(index, { stockQuantity: Number(event.target.value) })}
                      />
                    )}
                    <p className="field-help">
                      {variant.sku ? `SKU: ${variant.sku}` : "A unique SKU is created when saved."} Untracked published
                      packs can be ordered even with zero stock.
                    </p>
                  </details>
                </div>
              )}
              <div className="pack-editor-actions">
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => movePack(index, -1)}
                  aria-label={`Move ${variant.name || "pack"} earlier`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === variants.length - 1}
                  onClick={() => movePack(index, 1)}
                  aria-label={`Move ${variant.name || "pack"} later`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    const key = crypto.randomUUID();
                    setVariants((current) => [
                      ...current,
                      {
                        ...variant,
                        id: key,
                        key,
                        sku: undefined,
                        expectedStockQuantity: undefined,
                        name: `${variant.name} (Copy)`,
                        active: false,
                      },
                    ]);
                    setEditingPack(key);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => patchPack(index, { active: !variant.active })}
                >
                  {variant.active ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => setVariants((current) => current.filter((v) => v.key !== variant.key))}
                >
                  Retire
                </button>
              </div>
            </div>
          ))}
        </div>

        {isCake ? (
          <div className="product-editor-section">
            <div className="editor-section-head">
              <div>
                <h3>Flavours &amp; fillings</h3>
                <p className="field-help">
                  Tick the flavours and fillings this cake offers. The customer picks one per layer (layers are set on
                  each size above). Manage the master lists in “Flavours &amp; sizes”.
                </p>
              </div>
            </div>
            <div className="cake-library-pickers">
              <fieldset>
                <legend>Flavours</legend>
                {flavourLibrary.length ? (
                  flavourLibrary.map((name) => (
                    <Checkbox
                      key={name}
                      label={name}
                      checked={cakeFlavours.includes(name)}
                      onChange={() => setCakeFlavours((current) => toggleIn(current, name))}
                    />
                  ))
                ) : (
                  <p className="field-help">No flavours yet — add some in “Flavours &amp; sizes”.</p>
                )}
              </fieldset>
              <fieldset>
                <legend>Fillings</legend>
                {fillingLibrary.length ? (
                  fillingLibrary.map((name) => (
                    <Checkbox
                      key={name}
                      label={name}
                      checked={cakeFillings.includes(name)}
                      onChange={() => setCakeFillings((current) => toggleIn(current, name))}
                    />
                  ))
                ) : (
                  <p className="field-help">No fillings yet — add some in “Flavours &amp; sizes”.</p>
                )}
              </fieldset>
            </div>
          </div>
        ) : (
          <div className="product-editor-section">
            <div className="editor-section-head">
              <div>
                <h3>Options &amp; flavours</h3>
                <p className="field-help">
                  Dropdowns the customer picks on the product page. Size and price stay in{" "}
                  {mode === "MADE_TO_ORDER" ? "Pack options" : "Variants / packs"} above. These choices don’t change the
                  price.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={addOptionGroup}>
                Add option group
              </Button>
            </div>
            {optionGroups.map((group, index) => (
              <div className="option-group-editor" key={group.key}>
                <Input
                  label="Option name"
                  value={group.name}
                  placeholder="Topping"
                  onChange={(event) => patchOptionGroup(index, { name: event.target.value })}
                />
                <Textarea
                  label="Choices (one per line)"
                  rows={4}
                  value={group.choicesText}
                  placeholder={"Small\nLarge"}
                  onChange={(event) => patchOptionGroup(index, { choicesText: event.target.value })}
                />
                <div className="option-group-actions">
                  <Checkbox
                    label="Required"
                    checked={group.required}
                    onChange={(event) => patchOptionGroup(index, { required: event.target.checked })}
                  />
                  <button type="button" className="text-button" onClick={() => removeOptionGroup(index)}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {!optionGroups.length && (
              <p className="field-help">No options yet. Add one if this product needs customer choices.</p>
            )}
          </div>
        )}

        <div className="product-editor-section">
          <h3>Images</h3>
          <p className="field-help">JPG, PNG, WebP, or AVIF. Maximum 5 MB each and 12 images per product.</p>
          {images.map((image, index) => (
            <div className="image-editor" key={image.id}>
              <Image src={image.url} alt="" width={64} height={64} unoptimized />
              <Input
                label="Alternative text"
                value={image.altText}
                onChange={(event) =>
                  setImages((current) =>
                    current.map((item) => (item.id === image.id ? { ...item, altText: event.target.value } : item)),
                  )
                }
                required
              />
              <div className="image-order-actions">
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === 0}
                  onClick={() => moveImage(index, -1)}
                  aria-label={`Move ${image.altText} earlier`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === images.length - 1}
                  onClick={() => moveImage(index, 1)}
                  aria-label={`Move ${image.altText} later`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="text-button danger-text"
                  onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          {pendingImages.map((pending, index) => (
            <div className="pending-image" key={pending.key}>
              <span>{pending.file.name}</span>
              <Input
                label="Alternative text"
                value={pending.altText}
                onChange={(event) =>
                  setPendingImages((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, altText: event.target.value } : item,
                    ),
                  )
                }
                required
              />
              <button
                type="button"
                className="text-button danger-text"
                onClick={() => setPendingImages((current) => current.filter((item) => item.key !== pending.key))}
              >
                Remove
              </button>
            </div>
          ))}
          <Input
            label="Upload product images"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            disabled={images.length + pendingImages.length >= 12}
            onChange={(event) => {
              const remaining = 12 - images.length - pendingImages.length;
              const selected = Array.from(event.target.files ?? []).slice(0, remaining);
              const oversized = selected.filter((file) => file.size > MAX_IMAGE_BYTES);
              const valid = selected.filter((file) => file.size <= MAX_IMAGE_BYTES);
              if (oversized.length) {
                const names = oversized.map((file) => file.name).join(", ");
                setError(
                  `${names} ${oversized.length === 1 ? "is" : "are"} over 4 MB. Resize or compress before uploading.`,
                );
              } else {
                setError("");
              }
              setPendingImages((current) => [
                ...current,
                ...valid.map((file) => ({ key: crypto.randomUUID(), file, altText: product?.name ?? "" })),
              ]);
              event.target.value = "";
            }}
          />
        </div>

        <div className="product-editor-section">
          <h3>Product details</h3>
          <Textarea label="Ingredients" name="ingredients" defaultValue={product?.ingredients} rows={3} />
          <Input label="Allergens (comma separated)" name="allergens" defaultValue={product?.allergens.join(", ")} />
          <Textarea
            label="Storage instructions"
            name="storageInstructions"
            defaultValue={product?.storageInstructions}
            rows={3}
          />
          <Textarea
            label="Preparation instructions"
            name="preparationInstructions"
            defaultValue={product?.preparationInstructions}
            rows={3}
          />
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="drawer-actions">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : product ? "Save changes" : "Create product"}
          </Button>
        </div>
      </form>
    </div>
  );
}
