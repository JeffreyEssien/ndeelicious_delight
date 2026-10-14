"use client";

import Image from "next/image";
import { type FormEvent, useEffect, useState } from "react";
import type { Product, ProductImage, ProductStatus, ProductVariant } from "@/types";
import { Button, Checkbox, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { variantPrice } from "@/features/catalog/pricing";
import { useBusinessSettings } from "@/components/providers";

type DraftVariant = Omit<ProductVariant, "id"> & {
  id?: string;
  key: string;
  sellingPrice: number;
  expectedStockQuantity?: number;
};
type PendingImage = { key: string; file: File; altText: string };

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ProductEditor({
  product,
  close,
  onSaved,
}: {
  product: Product | null;
  close: () => void;
  onSaved: (updated: Partial<Product>) => void;
}) {
  const { currency } = useBusinessSettings();
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
  const [mode, setMode] = useState(
    product?.shoppingMode ?? (product?.category === "READY_TO_BAKE" ? "READY_TO_BAKE" : "READY_TO_ORDER"),
  );
  const [price, setPrice] = useState(String((product?.price ?? 0) / 100));
  const [discount, setDiscount] = useState(
    product?.discountPrice === undefined ? "" : String(product.discountPrice / 100),
  );
  const [editingPack, setEditingPack] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(product?.category ?? "PASTRIES");
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
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Could not upload ${pending.file.name}.`);
      setImages((current) => [...current, payload.image]);
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
      shoppingMode: String(form.get("shoppingMode")),
      preparationHours: Number(form.get("preparationHours")) / (form.get("preparationUnit") === "minutes" ? 60 : 1),
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
      collectionId: collectionId || null,
    };

    try {
      const productId = savedId;
      const response = await fetch(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
        method: productId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Product could not be saved.");
      setSavedId(result.id);
      if (pendingImages.length) await uploadImages(result.id, name);
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
            label="Short description"
            name="shortDescription"
            defaultValue={product?.shortDescription}
            rows={2}
            required
          />
          <Textarea label="Full description" name="description" defaultValue={product?.description} rows={5} required />
          <Select
            label="Category"
            name="category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
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
          <Select
            label="Shopping mode"
            name="shoppingMode"
            value={mode}
            onChange={(event) => {
              const next = event.target.value as NonNullable<Product["shoppingMode"]>;
              if (next === "MADE_TO_ORDER" && mode !== next) {
                setVariants((current) =>
                  !product && current.length === 1 && current[0].key === "standard"
                    ? []
                    : current.map((v) => ({ ...v, sellingPrice: effectiveBase + v.priceAdjustment })),
                );
              }
              if (mode === "MADE_TO_ORDER" && next !== mode) {
                setVariants((current) =>
                  current.map((v) => ({ ...v, priceAdjustment: v.sellingPrice - effectiveBase })),
                );
              }
              setMode(next);
            }}
          >
            <option value="READY_TO_ORDER">Ready to Order</option>
            <option value="MADE_TO_ORDER">Made to Order</option>
            <option value="READY_TO_BAKE">Ready to Bake</option>
          </Select>
          <Input
            label="Preparation time"
            name="preparationHours"
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
            name="preparationUnit"
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
              <h3>{mode === "MADE_TO_ORDER" ? "Pack options" : "Variants / packs"}</h3>
              <p className="field-help">
                {mode === "MADE_TO_ORDER"
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
                  },
                ]);
                setEditingPack(key);
              }}
            >
              <Icon name="plus" />
              {mode === "MADE_TO_ORDER" ? "Add pack" : "Add variant"}
            </Button>
          </div>
          {mode === "MADE_TO_ORDER" && (
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
          {!variants.length && (
            <p className="empty-state">No packs yet. Add any size, then enter its name and price before publishing.</p>
          )}
          {variants.map((variant, index) => (
            <div className="pack-editor-card" key={variant.key}>
              <div className="pack-editor-summary">
                <div>
                  <strong>{variant.name || "New pack"}</strong>
                  <p>
                    {variant.packQuantity ? `${variant.packQuantity} pieces · ` : "Size not set · "}
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
                      label="Pieces per pack"
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

        <div className="product-editor-section">
          <h3>Images</h3>
          <p className="field-help">JPG, PNG, WebP, or AVIF. Maximum 5 MB each and 12 images per product.</p>
          {images.map((image, index) => (
            <div className="image-editor" key={image.id}>
              <Image src={image.url} alt="" width={64} height={64} />
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
              setPendingImages((current) => [
                ...current,
                ...selected.map((file) => ({ key: crypto.randomUUID(), file, altText: product?.name ?? "" })),
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
