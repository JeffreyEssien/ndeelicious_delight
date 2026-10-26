"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { CakeSizeLayer, Product, ProductImage, ProductStatus, ProductVariant } from "@/types";
import { MIN_LEAD_TIME_HOURS } from "@/validations/product";
import { Button, Checkbox, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { normalizeCakeSizeLayers, variantPrice } from "@/features/catalog/pricing";
import { useBusinessSettings } from "@/components/providers";
import { prepareImageForUpload } from "@/lib/images/prepare-upload";

type DraftVariant = Omit<ProductVariant, "id"> & {
  id?: string;
  key: string;
  sellingPrice: number;
  expectedStockQuantity?: number;
  layerOptions?: CakeSizeLayer[];
};
type PendingImage = { key: string; file: File; altText: string; previewUrl: string };
type DraftOptionGroup = { key: string; id: string; name: string; choicesText: string; required: boolean };

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

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
        ? "That upload was too large for the server. Please try a smaller photo."
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
  // One lead time for every product, in hours: how long after an order is placed it can be ready.
  const [leadTimeHours, setLeadTimeHours] = useState(
    String(Math.max(MIN_LEAD_TIME_HOURS, Math.ceil(product?.preparationHours ?? MIN_LEAD_TIME_HOURS))),
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [preparingPhotos, setPreparingPhotos] = useState(false);
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
      : // New products start without packs: made-to-order packs need a size and price the owner chooses.
        [],
  );
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [photoError, setPhotoError] = useState("");
  // Preview URLs hold the photo in memory until revoked; release any still pending when the editor closes.
  const pendingRef = useRef(pendingImages);
  pendingRef.current = pendingImages;
  useEffect(
    () => () => {
      for (const pending of pendingRef.current) URL.revokeObjectURL(pending.previewUrl);
    },
    [],
  );
  function removePending(key: string) {
    setPendingImages((current) =>
      current.filter((item) => {
        if (item.key === key) URL.revokeObjectURL(item.previewUrl);
        return item.key !== key;
      }),
    );
  }

  async function addPhotos(files: File[]) {
    const remaining = 12 - images.length - pendingImages.length;
    const selected = files.slice(0, remaining);
    const problems = files.length > remaining ? [`Only ${remaining} more photo(s) fit; a product can have 12.`] : [];
    setPreparingPhotos(true);
    const prepared: PendingImage[] = [];
    for (const file of selected) {
      try {
        const ready = await prepareImageForUpload(file);
        prepared.push({ key: crypto.randomUUID(), file: ready, altText: "", previewUrl: URL.createObjectURL(ready) });
      } catch (reason) {
        problems.push(reason instanceof Error ? reason.message : `${file.name} could not be added.`);
      }
    }
    setPendingImages((current) => [...current, ...prepared]);
    setPhotoError(problems.join(" "));
    setPreparingPhotos(false);
  }
  const [optionGroups] = useState<DraftOptionGroup[]>(
    (product?.optionGroups ?? []).map((group) => ({
      key: group.id,
      id: group.id,
      name: group.name,
      choicesText: group.choices.join("\n"),
      required: group.required,
    })),
  );

  // Cakes pick their flavours/fillings from the shared library (stored as option groups named
  // "Flavour"/"Filling"). Only cakes offer customer options; any older options on other products
  // are kept unchanged when saving.
  const initialGroupChoices = (name: string) =>
    product?.optionGroups?.find((group) => group.name === name)?.choices ?? [];
  const [cakeFlavours, setCakeFlavours] = useState<string[]>(initialGroupChoices("Flavour"));
  const [cakeFillings, setCakeFillings] = useState<string[]>(initialGroupChoices("Filling"));
  function toggleIn(list: string[], value: string) {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
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

  // Uploads every pending photo, carrying on past failures, and returns one message per failed photo.
  async function uploadImages(productId: string, productName: string) {
    const failures: string[] = [];
    for (const [index, pending] of pendingImages.entries()) {
      setProgress(`Uploading photo ${index + 1} of ${pendingImages.length}…`);
      try {
        await uploadImage(productId, productName, pending, images.length + index);
      } catch (reason) {
        failures.push(reason instanceof Error ? reason.message : `Could not upload ${pending.file.name}.`);
      }
    }
    return failures;
  }

  async function uploadImage(productId: string, productName: string, pending: PendingImage, sortOrder: number) {
    // Get signed upload parameters, send the file straight to Cloudinary, then record it. Uploading
    // directly bypasses Vercel's 4.5 MB function body limit that a file sent through our server would hit.
    const signResponse = await fetch("/api/admin/products/images/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const sign = await readJsonResponse(signResponse);
    if (!signResponse.ok) throw new Error(sign.error ?? `Could not upload ${pending.file.name}.`);

    const upload = new FormData();
    for (const [key, value] of Object.entries(sign.fields as Record<string, string | number>))
      upload.set(key, String(value));
    upload.set("file", pending.file);
    const uploaded = await fetch(sign.uploadUrl as string, { method: "POST", body: upload })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    if (!uploaded?.public_id)
      throw new Error(`Could not upload ${pending.file.name}. Check your connection and try again.`);

    const response = await fetch("/api/admin/products/images", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        productId,
        publicId: uploaded.public_id,
        altText: pending.altText.trim() || productName,
        sortOrder,
      }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error ?? `Could not upload ${pending.file.name}.`);
    setImages((current) => [...current, payload.image as ProductImage]);
    removePending(pending.key);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || preparingPhotos) return;
    setBusy(true);
    setProgress("Saving product…");
    setError("");
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name"));
    const preparationHours = Number(leadTimeHours || MIN_LEAD_TIME_HOURS);
    // Every pack or size carries its own selling price. The product's base price is the cheapest published
    // one (or the cheapest overall while nothing is published), and each pack is stored relative to it.
    const priced = variants.some((variant) => variant.active) ? variants.filter((variant) => variant.active) : variants;
    const basePrice = priced.length ? Math.min(...priced.map((variant) => variant.sellingPrice)) : 0;
    const payload = {
      name,
      slug: String(form.get("slug")) || slugify(name),
      shortDescription: String(form.get("shortDescription")),
      description: String(form.get("description")),
      category: String(form.get("category")),
      price: basePrice,
      discountPrice: null,
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
        priceAdjustment: variant.sellingPrice - basePrice,
        packQuantity: variant.packQuantity ?? null,
        stockQuantity: variant.stockQuantity,
        active: variant.active,
        sortOrder: index,
        trackInventory: variant.trackInventory ?? null,
        expectedStockQuantity: variant.expectedStockQuantity,
      })),
      images: images.map((image, index) => ({
        id: image.id,
        altText: image.altText.trim() || name,
        sortOrder: index,
      })),
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
      const failures = pendingImages.length ? await uploadImages(result.id as string, name) : [];
      if (failures.length) {
        // The product itself is saved; keep the editor open so only the failed photos need retrying.
        router.refresh();
        setError(
          `Product saved, but ${failures.length === 1 ? "1 photo was" : `${failures.length} photos were`} not uploaded. ${failures.join(" ")} Press Save changes to try again.`,
        );
        setBusy(false);
        return;
      }
      onSaved({ preparationHours: payload.preparationHours });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Product could not be saved.");
      setBusy(false);
    } finally {
      setProgress("");
    }
  }

  return (
    <div className="product-editor-content">
      <div className="panel-head">
        <div>
          <span className="overline">Catalogue</span>
          <h2>{savedId ? "Edit product" : "Add product"}</h2>
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
          <h3>Visibility</h3>
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
          <Input
            label="Lead time (hours)"
            type="number"
            min={MIN_LEAD_TIME_HOURS}
            max="8760"
            step="1"
            value={leadTimeHours}
            onChange={(event) => setLeadTimeHours(event.target.value)}
            required
          />
          <p className="field-help">
            How long after an order is placed it can be ready. At least {MIN_LEAD_TIME_HOURS} hours; for example 48 for
            two days.
          </p>
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
                    : "Add each option the customer can buy and set its selling price."}
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
                    {currency} {(variant.sellingPrice / 100).toFixed(2)} ·{" "}
                    {variant.active ? "Published" : "Unavailable"}
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
                      label={`Selling price (${currency})`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={variant.sellingPrice / 100}
                      onChange={(event) =>
                        patchPack(index, { sellingPrice: Math.round(Number(event.target.value) * 100) })
                      }
                      required={variant.active}
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
        ) : null}

        <div className="product-editor-section">
          <h3>Photos</h3>
          <p className="field-help">
            Add up to 12 photos. Large phone photos are resized automatically. The first photo is the main one; use the
            arrows to reorder. New photos upload when you save.
          </p>
          {images.map((image, index) => (
            <div className="image-editor" key={image.id}>
              <Image src={image.url} alt="" width={64} height={64} unoptimized />
              <Input
                label="Photo description (optional)"
                placeholder="Describes the photo for screen readers"
                value={image.altText}
                onChange={(event) =>
                  setImages((current) =>
                    current.map((item) => (item.id === image.id ? { ...item, altText: event.target.value } : item)),
                  )
                }
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
              {/* biome-ignore lint/performance/noImgElement: local blob preview, nothing to optimise */}
              <img src={pending.previewUrl} alt="" width={64} height={64} />
              <Input
                label="Photo description (optional)"
                placeholder="Not uploaded yet — saves with the product"
                value={pending.altText}
                onChange={(event) =>
                  setPendingImages((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, altText: event.target.value } : item,
                    ),
                  )
                }
              />
              <button type="button" className="text-button danger-text" onClick={() => removePending(pending.key)}>
                Remove
              </button>
            </div>
          ))}
          <Input
            label={preparingPhotos ? "Preparing photos…" : "Add photos"}
            type="file"
            accept="image/*"
            multiple
            disabled={preparingPhotos || images.length + pendingImages.length >= 12}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length) void addPhotos(files);
            }}
          />
          {photoError && (
            <p className="form-error" role="alert">
              {photoError}
            </p>
          )}
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
          <Button type="submit" disabled={busy || preparingPhotos}>
            {busy
              ? progress || "Saving…"
              : preparingPhotos
                ? "Preparing photos…"
                : savedId
                  ? "Save changes"
                  : "Create product"}
          </Button>
        </div>
      </form>
    </div>
  );
}
