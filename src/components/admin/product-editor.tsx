"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { CakeSizeLayer, Product, ProductImage, ProductStatus, ProductVariant } from "@/types";
import { isVisibleStatus, MIN_LEAD_TIME_HOURS, productInputSchema, productIssues } from "@/validations/product";
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
// A photo waiting to upload. `file` is null while it is still being converted; `progress` (0–1) is set
// while it uploads.
type PendingImage = {
  key: string;
  name: string;
  file: File | null;
  altText: string;
  previewUrl: string | null;
  progress: number | null;
};
const UPLOAD_CONCURRENCY = 3;
type DraftOptionGroup = { key: string; id: string; name: string; choicesText: string; required: boolean };

// Accents are dropped ("Ẹ̀wà Agoyin" → "ewa-agoyin"). A name with no letters or numbers at all (an emoji)
// still gets a usable link.
function slugify(value: string) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 150)
    .replace(/-$/, "");
  return slug.length >= 2 ? slug : `product-${crypto.randomUUID().slice(0, 8)}`;
}

// A whole number within range, whatever was typed (blank, "abc", -3, 2.5).
const wholeNumber = (value: unknown, min: number, max: number, fallback = min) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
// A money amount in cents, never negative.
const cents = (value: string) => Math.max(0, Math.round((Number(value) || 0) * 100));

const OFFLINE_MESSAGE =
  "Could not reach the website. Check your internet connection and press Save again. Nothing you typed is lost.";
const SIGNED_OUT_MESSAGE =
  "You were signed out. Log in again in a new tab, then come back here and press Save. Your changes are still here.";

// fetch that turns a dropped connection or an expired login into a message the owner can act on.
async function send(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(OFFLINE_MESSAGE);
  }
  if (response.status === 401) throw new Error(SIGNED_OUT_MESSAGE);
  return response;
}

// Everything typed into the editor, kept on this device until it is saved, so a closed drawer, a
// refreshed page, a lost connection or a failed save never means starting again.
type EditorBackup = {
  savedAt: number;
  fields: Record<string, string | boolean>;
  category: string;
  collectionId: string;
  preparation: { hours: string; minutes: string };
  variants: DraftVariant[];
  imageOrder: { id: string; altText: string }[];
  cakeFlavours: string[];
  cakeFillings: string[];
};
const backupKey = (productId: string) => `ndee:product-editor:${productId || "new"}`;
function readBackup(key: string): EditorBackup | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as EditorBackup) : null;
  } catch {
    return null;
  }
}
function writeBackup(key: string, backup: EditorBackup | null) {
  try {
    if (backup) localStorage.setItem(key, JSON.stringify(backup));
    else localStorage.removeItem(key);
  } catch {
    // Storage can be full or blocked (private browsing); the editor still works without a backup.
  }
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

type CloudinaryReply = { public_id?: string; error?: { message?: string } };

// Posts the photo to Cloudinary, reporting upload progress. Resolves null when the connection drops.
function postWithProgress(url: string, body: FormData, onProgress: (fraction: number) => void) {
  return new Promise<CloudinaryReply | null>((resolve) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.responseType = "json";
    request.timeout = 120_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => resolve(request.response as CloudinaryReply | null);
    request.onerror = () => resolve(null);
    request.ontimeout = () => resolve(null);
    request.send(body);
  });
}

// The values of the form's plain fields, by name.
function formFields(form: HTMLFormElement) {
  const fields: EditorBackup["fields"] = {};
  for (const element of Array.from(form.elements)) {
    if (
      !(element instanceof HTMLInputElement) &&
      !(element instanceof HTMLTextAreaElement) &&
      !(element instanceof HTMLSelectElement)
    )
      continue;
    // The category is held in state; files cannot be stored.
    if (!element.name || element.name === "category" || element.type === "file") continue;
    fields[element.name] =
      element instanceof HTMLInputElement && element.type === "checkbox" ? element.checked : element.value;
  }
  return fields;
}

export function ProductEditor({
  product,
  close,
  onSaved,
  onDirtyChange,
  flavourLibrary: initialFlavours = [],
  fillingLibrary: initialFillings = [],
  sizeLibrary: initialSizes = [],
}: {
  product: Product | null;
  close: () => void;
  onSaved: (updated: Partial<Product>) => void;
  onDirtyChange?: (dirty: boolean) => void;
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
  // How long this product takes to make, in hours and minutes. The shop-wide minimum lead time is separate.
  const [preparation, setPreparation] = useState(() => {
    const total = Math.round((product?.preparationHours ?? 0) * 60);
    return { hours: String(Math.floor(total / 60)), minutes: String(total % 60) };
  });
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
  const [error, setError] = useState("");
  // Problems to fix before the product can be shown to customers, listed together.
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [offerDraftSave, setOfferDraftSave] = useState(false);
  const [savedId, setSavedId] = useState(product?.id ?? "");
  // The status customers currently see, as last saved.
  const [liveStatus, setLiveStatus] = useState<ProductStatus>(product?.status ?? "DRAFT");
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
  const preparingPhotos = pendingImages.some((pending) => !pending.file);
  // Preview URLs hold the photo in memory until revoked; release any still pending when the editor closes.
  const pendingRef = useRef(pendingImages);
  pendingRef.current = pendingImages;
  useEffect(
    () => () => {
      for (const pending of pendingRef.current) if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    },
    [],
  );
  function patchPending(key: string, patch: Partial<PendingImage>) {
    setPendingImages((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }
  function removePending(key: string) {
    setPendingImages((current) =>
      current.filter((item) => {
        if (item.key === key && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        return item.key !== key;
      }),
    );
  }

  // Each photo shows straight away with a loader while it is converted to a standard WebP/JPEG.
  async function addPhotos(files: File[]) {
    const remaining = 12 - images.length - pendingImages.length;
    const selected = files.slice(0, remaining).map((file) => ({ file, key: crypto.randomUUID() }));
    const problems = files.length > remaining ? [`Only ${remaining} more photo(s) fit; a product can have 12.`] : [];
    setPhotoError("");
    setPendingImages((current) => [
      ...current,
      ...selected.map(({ file, key }) => ({
        key,
        name: file.name,
        file: null,
        altText: "",
        previewUrl: null,
        progress: null,
      })),
    ]);
    for (const { file, key } of selected) {
      try {
        const ready = await prepareImageForUpload(file);
        patchPending(key, { file: ready, previewUrl: URL.createObjectURL(ready) });
      } catch (reason) {
        removePending(key);
        problems.push(reason instanceof Error ? reason.message : `${file.name} could not be added.`);
      }
    }
    setPhotoError(problems.join(" "));
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

  // Autosave to this device: every change is written to a backup after a short pause, and the backup is
  // cleared once the server has the product. Opening the editor again offers to restore it.
  const formRef = useRef<HTMLFormElement>(null);
  const [fieldsVersion, setFieldsVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const baselineRef = useRef<string | null>(null);
  const rebaselineRef = useRef(false);
  const [backupOffer, setBackupOffer] = useState<EditorBackup | null>(null);
  const [restoreFields, setRestoreFields] = useState<EditorBackup["fields"] | null>(null);
  const currentKey = backupKey(savedId);

  useEffect(() => {
    setBackupOffer(readBackup(backupKey(product?.id ?? "")));
  }, [product?.id]);

  useEffect(() => {
    // Wait for fields and lists restored from a backup to reach the form before reading it.
    void fieldsVersion;
    const read = (form: HTMLFormElement): Omit<EditorBackup, "savedAt"> => ({
      fields: formFields(form),
      category,
      collectionId,
      preparation,
      variants,
      imageOrder: images.map((image) => ({ id: image.id, altText: image.altText })),
      cakeFlavours,
      cakeFillings,
    });
    // The starting point is read straight away on opening, before anything can be typed.
    if (baselineRef.current === null && formRef.current) {
      baselineRef.current = JSON.stringify(read(formRef.current));
      return;
    }
    const timer = setTimeout(() => {
      const form = formRef.current;
      if (!form) return;
      const snapshot = read(form);
      const json = JSON.stringify(snapshot);
      if (baselineRef.current === null || rebaselineRef.current) {
        baselineRef.current = json;
        rebaselineRef.current = false;
      }
      const changed = json !== baselineRef.current;
      setDirty(changed);
      if (changed) writeBackup(currentKey, { ...snapshot, savedAt: Date.now() });
    }, 300);
    return () => clearTimeout(timer);
  }, [fieldsVersion, category, collectionId, preparation, variants, images, cakeFlavours, cakeFillings, currentKey]);

  useEffect(() => {
    onDirtyChange?.(dirty || pendingImages.length > 0);
  }, [dirty, pendingImages.length, onDirtyChange]);

  // Warn before a refresh or closed tab while something is unsaved.
  useEffect(() => {
    if (!dirty && !pendingImages.length) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pendingImages.length]);

  // Called once the server has everything: the current state becomes the new starting point.
  function markSaved(previousKey: string) {
    writeBackup(previousKey, null);
    rebaselineRef.current = true;
    setDirty(false);
    setFieldsVersion((version) => version + 1);
  }

  function restoreBackup(backup: EditorBackup) {
    setCategory(backup.category);
    setCollectionId(backup.collectionId);
    // Older backups held one combined lead time instead; keep the product's current preparation time for those.
    if (backup.preparation) setPreparation(backup.preparation);
    // If stock moved on the server since the backup (an order came in), take the current stock so the save
    // is not refused as out of date.
    setVariants((current) => {
      const fresh = new Map(current.map((variant) => [variant.id, variant]));
      return backup.variants.map((variant) => {
        const latest = variant.id ? fresh.get(variant.id) : undefined;
        return latest && latest.expectedStockQuantity !== variant.expectedStockQuantity
          ? { ...variant, stockQuantity: latest.stockQuantity, expectedStockQuantity: latest.expectedStockQuantity }
          : variant;
      });
    });
    setCakeFlavours(backup.cakeFlavours);
    setCakeFillings(backup.cakeFillings);
    // Photos are saved as soon as they upload, so only their order and descriptions come from the backup.
    setImages((current) => {
      const byId = new Map(current.map((image) => [image.id, image]));
      const ordered = (backup.imageOrder ?? []).flatMap(({ id, altText }) => {
        const image = byId.get(id);
        byId.delete(id);
        return image ? [{ ...image, altText }] : [];
      });
      return [...ordered, ...byId.values()];
    });
    setRestoreFields(backup.fields);
    setBackupOffer(null);
  }

  useEffect(() => {
    const form = formRef.current;
    if (!restoreFields || !form) return;
    for (const [name, value] of Object.entries(restoreFields)) {
      const element = form.elements.namedItem(name);
      if (element instanceof HTMLInputElement && element.type === "checkbox") element.checked = Boolean(value);
      else if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement
      )
        element.value = String(value);
    }
    setRestoreFields(null);
    setFieldsVersion((version) => version + 1);
  }, [restoreFields]);

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

  // Uploads the pending photos a few at a time, carrying on past failures, and returns one message per
  // failed photo. Uploaded photos join the gallery in the order they were added.
  async function uploadImages(productId: string, productName: string) {
    const queue = [...pendingImages.entries()];
    const uploaded: (ProductImage | null)[] = [];
    const failures: string[] = [];
    async function worker() {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [index, pending] = next;
        try {
          uploaded[index] = await uploadImage(productId, productName, pending, images.length + index);
        } catch (reason) {
          patchPending(pending.key, { progress: null });
          failures.push(reason instanceof Error ? reason.message : `Could not upload ${pending.name}.`);
        }
      }
    }
    await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
    const done = uploaded.filter((image): image is ProductImage => Boolean(image));
    setImages((current) => [...current, ...done]);
    for (const [index, pending] of pendingImages.entries()) if (uploaded[index]) removePending(pending.key);
    return failures;
  }

  async function uploadImage(
    productId: string,
    productName: string,
    pending: PendingImage,
    sortOrder: number,
  ): Promise<ProductImage> {
    const file = pending.file;
    if (!file) throw new Error(`${pending.name} is still being prepared.`);
    patchPending(pending.key, { progress: 0 });
    // Get signed upload parameters, send the file straight to Cloudinary, then record it. Uploading
    // directly bypasses Vercel's 4.5 MB function body limit that a file sent through our server would hit.
    const signResponse = await send("/api/admin/products/images/sign", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ productId }),
    });
    const sign = await readJsonResponse(signResponse);
    if (!signResponse.ok) throw new Error(sign.error ?? `Could not upload ${pending.name}.`);

    const upload = new FormData();
    for (const [key, value] of Object.entries(sign.fields as Record<string, string | number>))
      upload.set(key, String(value));
    upload.set("file", file);
    const onProgress = (fraction: number) => patchPending(pending.key, { progress: fraction });
    // A dropped connection is retried once before giving up.
    let uploaded = await postWithProgress(sign.uploadUrl as string, upload, onProgress);
    if (!uploaded) uploaded = await postWithProgress(sign.uploadUrl as string, upload, onProgress);
    // Cloudinary explains a refusal; show that rather than blaming the connection.
    if (uploaded?.error?.message) throw new Error(`Could not upload ${pending.name}: ${uploaded.error.message}.`);
    if (!uploaded?.public_id) throw new Error(`Could not upload ${pending.name}. Check your connection and try again.`);

    const response = await send("/api/admin/products/images", {
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
    if (!response.ok) throw new Error(payload.error ?? `Could not upload ${pending.name}.`);
    patchPending(pending.key, { progress: 1 });
    return payload.image as ProductImage;
  }

  const uploading = pendingImages.filter((pending) => pending.progress !== null);
  const uploadPercent = uploading.length
    ? Math.round((uploading.reduce((sum, pending) => sum + (pending.progress ?? 0), 0) / uploading.length) * 100)
    : null;

  // What the server stores, built from the form and the given packs.
  function buildPayload(form: FormData, draftVariants: DraftVariant[], status: ProductStatus) {
    const name = String(form.get("name") ?? "").trim();
    // Every pack or size carries its own selling price. The product's base price is the cheapest published
    // one (or the cheapest overall while nothing is published), and each pack is stored relative to it.
    const priced = draftVariants.some((variant) => variant.active)
      ? draftVariants.filter((variant) => variant.active)
      : draftVariants;
    const basePrice = priced.length ? Math.min(...priced.map((variant) => variant.sellingPrice)) : 0;
    return {
      name,
      slug: slugify(String(form.get("slug") ?? "") || name),
      shortDescription: String(form.get("shortDescription") ?? ""),
      description: String(form.get("description") ?? ""),
      category,
      price: basePrice,
      discountPrice: null,
      status,
      featured: form.get("featured") === "on",
      shoppingMode: mode,
      preparationHours: (Number(preparation.hours) || 0) + (Number(preparation.minutes) || 0) / 60,
      taxClass: String(form.get("taxClass")),
      trackInventory: form.get("trackInventory") === "on",
      lowStockThreshold: Number(form.get("lowStockThreshold") || 5),
      ingredients: String(form.get("ingredients") ?? ""),
      // Split on commas or new lines, dropping blanks and repeats ("Eggs, eggs,, Dairy").
      allergens: String(form.get("allergens") ?? "")
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(
          (item, index, all) => item && all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index,
        ),
      storageInstructions: String(form.get("storageInstructions") ?? ""),
      preparationInstructions: String(form.get("preparationInstructions") ?? ""),
      variants: draftVariants.map((variant, index) => ({
        id: variant.id,
        name: variant.name.trim(),
        priceAdjustment: variant.sellingPrice - basePrice,
        packQuantity: variant.packQuantity ? wholeNumber(variant.packQuantity, 1, 2_147_483_647) : null,
        stockQuantity: wholeNumber(variant.stockQuantity, 0, 1_000_000),
        active: variant.active,
        sortOrder: index,
        trackInventory: variant.trackInventory ?? null,
        expectedStockQuantity: variant.expectedStockQuantity,
      })),
      images: images.map((image, index) => ({
        id: image.id,
        altText: (image.altText.trim() || name).slice(0, 250),
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
            draftVariants
              .filter((variant) => variant.id && normalizeCakeSizeLayers(variant.layerOptions).length)
              .map((variant) => [variant.id, normalizeCakeSizeLayers(variant.layerOptions)]),
          )
        : {},
      collectionId: collectionId || null,
    };
  }

  // Packs that are not ready for customers (no name, price or size, or a size used twice) are switched to
  // unavailable so the rest of the product can still be saved.
  function withIncompletePacksOff(list: DraftVariant[]) {
    const sizes = new Set<number>();
    return list.map((variant) => {
      if (!variant.active) return variant;
      const size = variant.packQuantity ?? 0;
      const incomplete =
        !variant.name.trim() ||
        variant.sellingPrice <= 0 ||
        (mode === "MADE_TO_ORDER" && (size <= 0 || sizes.has(size)));
      if (size > 0) sizes.add(size);
      return incomplete ? { ...variant, active: false } : variant;
    });
  }

  // A hidden draft is saved even when details are missing or too long: text is trimmed to fit and blanks
  // get placeholders, so the owner can always come back and finish it.
  function asDraft(payload: ReturnType<typeof buildPayload>): ReturnType<typeof buildPayload> {
    return {
      ...payload,
      status: "DRAFT",
      preparationHours: wholeNumber(payload.preparationHours * 60, 0, 8760 * 60) / 60,
      lowStockThreshold: wholeNumber(payload.lowStockThreshold, 0, 1_000_000, 5),
      name: payload.name.length >= 2 ? payload.name.slice(0, 150) : `${payload.name || "Untitled"} product`.trim(),
      shortDescription: payload.shortDescription.slice(0, 500),
      description: payload.description.slice(0, 10_000),
      ingredients: payload.ingredients.slice(0, 5_000),
      storageInstructions: payload.storageInstructions.slice(0, 2_000),
      preparationInstructions: payload.preparationInstructions.slice(0, 2_000),
      allergens: payload.allergens.slice(0, 30).map((item) => item.slice(0, 100)),
      variants: payload.variants.map((variant, index) => ({
        ...variant,
        name: (variant.name || `${isCake ? "Size" : "Pack"} ${index + 1}`).slice(0, 100),
      })),
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await save(new FormData(event.currentTarget), false);
  }

  async function save(form: FormData, forceDraft: boolean) {
    if (busy || preparingPhotos) return;
    setBusy(true);
    setProgress("Saving product…");
    setError("");
    setIssues([]);
    setNotice("");
    setOfferDraftSave(false);
    const chosenStatus = forceDraft ? "DRAFT" : (String(form.get("status")) as ProductStatus);
    let payload = buildPayload(form, variants, chosenStatus);
    let toFinish: string[] = [];
    const check = productInputSchema.safeParse(payload);
    if (!check.success) {
      const problems = productIssues(check.error);
      if (isVisibleStatus(liveStatus) && isVisibleStatus(chosenStatus)) {
        // Saving as a draft would hide a product customers can see, so that is her call.
        setError(
          "Not saved yet. Fix the items below, or save it as a hidden draft for now. Your changes are kept on this device.",
        );
        setIssues(problems);
        setOfferDraftSave(true);
        setBusy(false);
        setProgress("");
        return;
      }
      const draftVariants = withIncompletePacksOff(variants);
      payload = asDraft(buildPayload(form, draftVariants, "DRAFT"));
      toFinish = problems;
      setVariants(draftVariants);
    }

    const previousKey = currentKey;
    try {
      const productId = savedId;
      const response = await send(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
        method: productId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await readJsonResponse(response);
      if (!response.ok) {
        if (Array.isArray(result.issues)) setIssues(result.issues as string[]);
        throw new Error(result.error ?? "Product could not be saved.");
      }
      setSavedId(result.id as string);
      setLiveStatus(payload.status);
      // Show what was actually stored: the status, and the link if it had to change to stay unique.
      const statusField = formRef.current?.elements.namedItem("status");
      if (statusField instanceof HTMLSelectElement) statusField.value = payload.status;
      const slugField = formRef.current?.elements.namedItem("slug");
      if (slugField instanceof HTMLInputElement && typeof result.slug === "string") slugField.value = result.slug;
      markSaved(previousKey);
      const failures = pendingImages.length ? await uploadImages(result.id as string, payload.name) : [];
      if (failures.length || toFinish.length) {
        // The product itself is saved; keep the editor open so the rest can be finished.
        router.refresh();
        const photoNote = failures.length
          ? `${failures.length === 1 ? "1 photo was" : `${failures.length} photos were`} not uploaded. ${failures.join(" ")} Press Save changes to try again.`
          : "";
        if (toFinish.length) {
          setNotice(
            `Saved as a hidden draft, so nothing is lost. Customers cannot see it yet. ${photoNote} To publish it, finish these and set visibility to Active:`,
          );
          setIssues(toFinish);
        } else setError(`Product saved, but ${photoNote}`);
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
      <form
        ref={formRef}
        onSubmit={submit}
        onInput={() => setFieldsVersion((version) => version + 1)}
        className="form-stack"
        // The browser's own checks would block saving; the editor lists problems itself and can always
        // fall back to saving a draft.
        noValidate
        aria-busy={busy}
      >
        {backupOffer && (
          <div className="restore-banner" role="status">
            <p>
              <strong>You have unsaved changes</strong> from{" "}
              {new Date(backupOffer.savedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
              Restore them to carry on where you left off.
            </p>
            <div>
              <Button variant="secondary" onClick={() => restoreBackup(backupOffer)}>
                Restore changes
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  writeBackup(backupKey(product?.id ?? ""), null);
                  setBackupOffer(null);
                }}
              >
                Discard
              </Button>
            </div>
          </div>
        )}
        <div className="product-editor-section">
          <h3>Basics</h3>
          <Input label="Product name" name="name" defaultValue={product?.name} maxLength={150} required />
          <details>
            <summary>Product link</summary>
            <Input
              label="URL slug"
              name="slug"
              defaultValue={product?.slug}
              maxLength={150}
              placeholder="Generated from the name"
            />
          </details>
          <Textarea
            label={isCake ? "Short description (optional)" : "Short description"}
            name="shortDescription"
            defaultValue={product?.shortDescription}
            maxLength={500}
            rows={2}
            required={!isCake}
          />
          <Textarea
            label={isCake ? "Full description (optional)" : "Full description"}
            name="description"
            defaultValue={product?.description}
            maxLength={10_000}
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
          <div className="field-row">
            <Input
              label="Preparation time (hours)"
              type="number"
              min="0"
              max="8760"
              step="1"
              value={preparation.hours}
              onChange={(event) => setPreparation((current) => ({ ...current, hours: event.target.value }))}
            />
            <Input
              label="Preparation time (minutes)"
              type="number"
              min="0"
              max="59"
              step="1"
              value={preparation.minutes}
              onChange={(event) => setPreparation((current) => ({ ...current, minutes: event.target.value }))}
            />
          </div>
          <p className="field-help">
            How long this product takes to make, for example 0 hours 45 minutes. Every order also has the shop&apos;s
            minimum lead time of {MIN_LEAD_TIME_HOURS} hours; customers get whichever is longer.
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
                    maxLength={100}
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
                        patchPack(index, {
                          packQuantity:
                            Number(event.target.value) >= 1 ? wholeNumber(event.target.value, 1, 1_000_000) : null,
                        })
                      }
                      required={mode === "MADE_TO_ORDER" && variant.active}
                    />
                    <Input
                      label={`Selling price (${currency})`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={variant.sellingPrice / 100}
                      onChange={(event) => patchPack(index, { sellingPrice: cents(event.target.value) })}
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
                                        ? {
                                            ...entry,
                                            priceAdjustment: Math.round((Number(event.target.value) || 0) * 100),
                                          }
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
                        onChange={(event) =>
                          patchPack(index, { stockQuantity: wholeNumber(event.target.value, 0, 1_000_000) })
                        }
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
          {pendingImages.map((pending) => (
            <div className="pending-image" key={pending.key}>
              <div className="pending-image-thumb" aria-busy={!pending.file || pending.progress !== null}>
                {pending.previewUrl ? (
                  // biome-ignore lint/performance/noImgElement: local blob preview, nothing to optimise
                  <img src={pending.previewUrl} alt="" width={64} height={64} />
                ) : (
                  <span className="photo-loader" role="status" aria-label={`Preparing ${pending.name}`} />
                )}
                {pending.progress !== null && (
                  <span
                    className="photo-upload-meter"
                    role="progressbar"
                    aria-label={`Uploading ${pending.name}`}
                    aria-valuenow={Math.round(pending.progress * 100)}
                  >
                    <span style={{ width: `${Math.round(pending.progress * 100)}%` }} />
                  </span>
                )}
              </div>
              <Input
                label="Photo description (optional)"
                placeholder={pending.file ? "Not uploaded yet — saves with the product" : "Preparing photo…"}
                value={pending.altText}
                onChange={(event) => patchPending(pending.key, { altText: event.target.value })}
              />
              <button
                type="button"
                className="text-button danger-text"
                disabled={busy}
                onClick={() => removePending(pending.key)}
              >
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
          <Textarea
            label="Ingredients"
            name="ingredients"
            defaultValue={product?.ingredients}
            maxLength={5_000}
            rows={3}
          />
          <Input label="Allergens (comma separated)" name="allergens" defaultValue={product?.allergens.join(", ")} />
          <Textarea
            label="Storage instructions"
            name="storageInstructions"
            defaultValue={product?.storageInstructions}
            maxLength={2_000}
            rows={3}
          />
          <Textarea
            label="Preparation instructions"
            name="preparationInstructions"
            defaultValue={product?.preparationInstructions}
            maxLength={2_000}
            rows={3}
          />
        </div>

        {(error || notice) && (
          <div className={error ? "form-error" : "form-notice"} role={error ? "alert" : "status"}>
            <p>{error || notice}</p>
            {issues.length > 0 && (
              <ul>
                {issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
            {offerDraftSave && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => formRef.current && void save(new FormData(formRef.current), true)}
              >
                Save as hidden draft
              </Button>
            )}
          </div>
        )}
        <div className="drawer-actions">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || preparingPhotos}>
            {busy
              ? uploadPercent !== null
                ? `Uploading photos… ${uploadPercent}%`
                : progress || "Saving…"
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
