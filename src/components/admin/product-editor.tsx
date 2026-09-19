"use client";

import Image from "next/image";
import { type FormEvent, useState } from "react";
import type { Product, ProductImage, ProductStatus, ProductVariant } from "@/types";
import { Button, Checkbox, Input, Select, Textarea } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";

type DraftVariant = Omit<ProductVariant, "id"> & { id?: string };
type PendingImage = { key: string; file: File; altText: string };

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function ProductEditor({ product, close, onSaved }: { product: Product | null; close: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState(product?.id ?? "");
  const [variants, setVariants] = useState<DraftVariant[]>(
    product?.variants.length
      ? product.variants.map((variant) => ({ ...variant, active: variant.active ?? true }))
      : [{ name: "Standard", sku: "", priceAdjustment: 0, stockQuantity: product?.stockQuantity ?? 0, active: true }],
  );
  const [images, setImages] = useState<ProductImage[]>(product?.images ?? []);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);

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
      sku: String(form.get("sku")),
      status: String(form.get("status")) as ProductStatus,
      featured: form.get("featured") === "on",
      trackInventory: form.get("trackInventory") === "on",
      stockQuantity: Number(form.get("stockQuantity")),
      lowStockThreshold: Number(form.get("lowStockThreshold")),
      ingredients: String(form.get("ingredients")),
      allergens: String(form.get("allergens"))
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      storageInstructions: String(form.get("storageInstructions")),
      preparationInstructions: String(form.get("preparationInstructions")),
      variants,
      images: images.map((image, index) => ({ id: image.id, altText: image.altText, sortOrder: index })),
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
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Product could not be saved.");
      setBusy(false);
    }
  }

  return (
    <aside className="admin-drawer product-editor" aria-label={product ? `Edit ${product.name}` : "Add product"}>
      <div className="panel-head">
        <div>
          <span className="overline">Catalogue</span>
          <h2>{product ? "Edit product" : "Add product"}</h2>
        </div>
        <button type="button" className="icon-button" onClick={close} aria-label="Close product drawer">
          <Icon name="close" />
        </button>
      </div>
      <form onSubmit={submit} className="form-stack">
        <div className="product-editor-section">
          <h3>Basics</h3>
          <Input label="Product name" name="name" defaultValue={product?.name} required />
          <Input label="URL slug" name="slug" defaultValue={product?.slug} placeholder="Generated from the name" />
          <Textarea label="Short description" name="shortDescription" defaultValue={product?.shortDescription} rows={2} required />
          <Textarea label="Full description" name="description" defaultValue={product?.description} rows={5} required />
          <Select label="Category" name="category" defaultValue={product?.category ?? "PASTRIES"}>
            <option value="PASTRIES">Fresh pastries</option>
            <option value="READY_TO_BAKE">Ready to bake</option>
            <option value="CUSTOM_CAKES">Custom cakes</option>
          </Select>
        </div>

        <div className="product-editor-section">
          <h3>Pricing & visibility</h3>
          <div className="field-row">
            <Input label="Price (₦)" name="price" type="number" min="0" step="0.01" defaultValue={(product?.price ?? 0) / 100} required />
            <Input label="Sale price (₦)" name="discountPrice" type="number" min="0" step="0.01" defaultValue={product?.discountPrice ? product.discountPrice / 100 : ""} />
          </div>
          <Input label="Product SKU" name="sku" defaultValue={product?.sku} />
          <Select label="Storefront visibility" name="status" defaultValue={product?.status ?? "DRAFT"}>
            <option value="DRAFT">Draft — hidden</option>
            <option value="ACTIVE">Active — visible</option>
            <option value="OUT_OF_STOCK">Out of stock</option>
            <option value="ARCHIVED">Archived — hidden</option>
          </Select>
          <Checkbox label="Feature this product on the storefront" name="featured" defaultChecked={product?.featured} />
        </div>

        <div className="product-editor-section">
          <h3>Inventory</h3>
          <Checkbox label="Track inventory" name="trackInventory" defaultChecked={product?.trackInventory ?? true} />
          <div className="field-row">
            <Input label="Total stock" name="stockQuantity" type="number" min="0" defaultValue={product?.stockQuantity ?? 0} required />
            <Input label="Low-stock alert" name="lowStockThreshold" type="number" min="0" defaultValue={product?.lowStockThreshold ?? 5} required />
          </div>
        </div>

        <div className="product-editor-section">
          <div className="editor-section-head">
            <h3>Variants</h3>
            <Button
              variant="secondary"
              onClick={() => setVariants((current) => [...current, { name: "", sku: "", priceAdjustment: 0, stockQuantity: 0, active: true }])}
            >
              <Icon name="plus" /> Add variant
            </Button>
          </div>
          {variants.map((variant, index) => (
            <div className="variant-editor" key={variant.id ?? `new-${index}`}>
              <Input label="Name" value={variant.name} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} required />
              <Input label="SKU" value={variant.sku ?? ""} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, sku: event.target.value } : item))} />
              <Input label="Price adjustment (₦)" type="number" step="0.01" value={variant.priceAdjustment / 100} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, priceAdjustment: Math.round(Number(event.target.value) * 100) } : item))} />
              <Input label="Stock" type="number" min="0" value={variant.stockQuantity} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, stockQuantity: Number(event.target.value) } : item))} />
              <Checkbox label="Active" checked={variant.active ?? true} onChange={(event) => setVariants((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, active: event.target.checked } : item))} />
              <button type="button" className="text-button danger-text" disabled={variants.length === 1} onClick={() => setVariants((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="product-editor-section">
          <h3>Images</h3>
          <p className="field-help">JPG, PNG, WebP, or AVIF. Maximum 5 MB each and 12 images per product.</p>
          {images.map((image, index) => (
            <div className="image-editor" key={image.id}>
              <Image src={image.url} alt="" width={64} height={64} />
              <Input label="Alternative text" value={image.altText} onChange={(event) => setImages((current) => current.map((item) => item.id === image.id ? { ...item, altText: event.target.value } : item))} required />
              <div className="image-order-actions">
                <button type="button" className="icon-button" disabled={index === 0} onClick={() => moveImage(index, -1)} aria-label={`Move ${image.altText} earlier`}>↑</button>
                <button type="button" className="icon-button" disabled={index === images.length - 1} onClick={() => moveImage(index, 1)} aria-label={`Move ${image.altText} later`}>↓</button>
                <button type="button" className="text-button danger-text" onClick={() => setImages((current) => current.filter((item) => item.id !== image.id))}>Remove</button>
              </div>
            </div>
          ))}
          {pendingImages.map((pending, index) => (
            <div className="pending-image" key={pending.key}>
              <span>{pending.file.name}</span>
              <Input label="Alternative text" value={pending.altText} onChange={(event) => setPendingImages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, altText: event.target.value } : item))} required />
              <button type="button" className="text-button danger-text" onClick={() => setPendingImages((current) => current.filter((item) => item.key !== pending.key))}>Remove</button>
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
          <Textarea label="Storage instructions" name="storageInstructions" defaultValue={product?.storageInstructions} rows={3} />
          <Textarea label="Preparation instructions" name="preparationInstructions" defaultValue={product?.preparationInstructions} rows={3} />
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="drawer-actions">
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button type="submit" disabled={busy}>{busy ? "Saving…" : product ? "Save changes" : "Create product"}</Button>
        </div>
      </form>
    </aside>
  );
}
