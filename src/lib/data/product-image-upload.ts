import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type AdminAuditActor, recordAdminAudit } from "@/lib/audit/admin-audit";
import { readAdminAuditState } from "@/lib/audit/admin-audit-state";
import { invalidateStorefrontCache } from "@/lib/cache/storefront";

export const IMAGE_BUCKET = "product-images";
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};
export const ALLOWED_IMAGE_TYPES = new Set(Object.keys(extensions));

export function imageExtension(contentType: string): string | undefined {
  return extensions[contentType];
}

const metadataSchema = z.object({
  productId: z.uuid(),
  altText: z.string().trim().min(1).max(250),
  sortOrder: z.number().int().min(0).max(20),
});

const commitSchema = z.object({
  productId: z.uuid(),
  path: z.string().min(1).max(200),
  altText: z.string().trim().min(1).max(250),
  sortOrder: z.number().int().min(0).max(20),
});

type ImageMetadata = { productId: string; path: string; altText: string; sortOrder: number };

// Inserts the image row, writes the audit record and refreshes the storefront cache. Shared by every
// upload path once a file is confirmed in storage; removes the object if the row cannot be saved.
async function finalizeProductImage(
  db: SupabaseClient,
  actor: AdminAuditActor,
  meta: ImageMetadata,
  previousValue: unknown,
) {
  const bucket = db.storage.from(IMAGE_BUCKET);
  const { data: publicUrl } = bucket.getPublicUrl(meta.path);
  const { data: image, error } = await db
    .from("product_images")
    .insert({
      product_id: meta.productId,
      url: publicUrl.publicUrl,
      alt_text: meta.altText,
      sort_order: meta.sortOrder,
      storage_path: meta.path,
    })
    .select("id,url,alt_text,sort_order,storage_path")
    .single();
  if (error || !image) {
    await bucket.remove([meta.path]);
    return Response.json({ error: "Image metadata could not be saved." }, { status: 500 });
  }
  try {
    const newValue = await readAdminAuditState(db, { type: "product", id: meta.productId });
    await recordAdminAudit(db, actor, {
      action: "PRODUCT_IMAGE_ADDED",
      entityType: "product",
      entityId: meta.productId,
      previousValue,
      newValue,
      metadata: { imageId: image.id },
    });
  } catch {
    return Response.json(
      { error: "The image was saved, but its audit record could not be verified." },
      { status: 500 },
    );
  }
  invalidateStorefrontCache();
  return Response.json(
    {
      image: {
        id: image.id,
        url: image.url,
        altText: image.alt_text,
        sortOrder: image.sort_order,
        storagePath: image.storage_path,
      },
    },
    { status: 201 },
  );
}

// Uploads the file through the server, then records it. Used by the Google Form import, which hands the
// file to us server-side. Browser uploads should use the signed direct-upload flow instead to avoid the
// serverless request body limit.
export async function addProductImage(db: SupabaseClient, actor: AdminAuditActor, form: FormData | null) {
  const file = form?.get("file");
  const parsed = metadataSchema.safeParse({
    productId: form?.get("productId"),
    altText: form?.get("altText"),
    sortOrder: Number(form?.get("sortOrder")),
  });
  if (!parsed.success || !(file instanceof File)) {
    return Response.json({ error: "Choose a valid image and provide alternative text." }, { status: 400 });
  }
  const extension = imageExtension(file.type);
  if (!extension || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    return Response.json({ error: "Use a JPG, PNG, WebP, or AVIF image up to 5 MB." }, { status: 400 });
  }

  let previousValue: unknown;
  try {
    previousValue = await readAdminAuditState(db, { type: "product", id: parsed.data.productId });
  } catch {
    return Response.json({ error: "The current product could not be verified for auditing." }, { status: 500 });
  }
  const [{ data: product }, { count: imageCount }] = await Promise.all([
    db.from("products").select("id").eq("id", parsed.data.productId).maybeSingle(),
    db.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", parsed.data.productId),
  ]);
  if (!product) return Response.json({ error: "Product could not be found." }, { status: 404 });
  if ((imageCount ?? 0) >= 12) return Response.json({ error: "A product can have up to 12 images." }, { status: 409 });

  const path = `${parsed.data.productId}/${crypto.randomUUID()}.${extension}`;
  const bucket = db.storage.from(IMAGE_BUCKET);
  const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return Response.json({ error: "Image upload failed." }, { status: 500 });
  return finalizeProductImage(db, actor, { ...parsed.data, path }, previousValue);
}

// Records an image the browser already uploaded directly to storage via a signed URL. Only small JSON
// metadata reaches the function, so this path is not subject to the serverless request body limit. The
// uploaded object is verified server-side before it is trusted.
export async function commitSignedProductImage(db: SupabaseClient, actor: AdminAuditActor, body: unknown) {
  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Choose a valid image and provide alternative text." }, { status: 400 });
  }
  // The object must live under the product's own folder so one product cannot claim another's upload.
  if (!parsed.data.path.startsWith(`${parsed.data.productId}/`)) {
    return Response.json({ error: "The uploaded image path is invalid." }, { status: 400 });
  }
  const bucket = db.storage.from(IMAGE_BUCKET);

  // The signed URL is client-driven, so never trust the browser's claim: confirm the object exists and
  // re-check its real size and type from storage.
  const { data: info, error: infoError } = await bucket.info(parsed.data.path);
  if (infoError || !info) {
    return Response.json({ error: "The uploaded image could not be found. Please try again." }, { status: 400 });
  }
  if (!info.contentType || !ALLOWED_IMAGE_TYPES.has(info.contentType) || !info.size || info.size > MAX_IMAGE_BYTES) {
    await bucket.remove([parsed.data.path]);
    return Response.json({ error: "Use a JPG, PNG, WebP, or AVIF image up to 5 MB." }, { status: 400 });
  }

  let previousValue: unknown;
  try {
    previousValue = await readAdminAuditState(db, { type: "product", id: parsed.data.productId });
  } catch {
    await bucket.remove([parsed.data.path]);
    return Response.json({ error: "The current product could not be verified for auditing." }, { status: 500 });
  }
  const [{ data: product }, { count: imageCount }] = await Promise.all([
    db.from("products").select("id").eq("id", parsed.data.productId).maybeSingle(),
    db.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", parsed.data.productId),
  ]);
  if (!product) {
    await bucket.remove([parsed.data.path]);
    return Response.json({ error: "Product could not be found." }, { status: 404 });
  }
  if ((imageCount ?? 0) >= 12) {
    await bucket.remove([parsed.data.path]);
    return Response.json({ error: "A product can have up to 12 images." }, { status: 409 });
  }
  return finalizeProductImage(db, actor, parsed.data, previousValue);
}
