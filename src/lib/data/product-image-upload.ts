import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type AdminAuditActor, recordAdminAudit } from "@/lib/audit/admin-audit";
import { readAdminAuditState } from "@/lib/audit/admin-audit-state";
import { invalidateStorefrontCache } from "@/lib/cache/storefront";
import {
  type CloudinaryImage,
  CloudinaryNotConfiguredError,
  deleteImage,
  findImage,
  imageFolder,
  isAcceptedUpload,
  isAllowedImageFile,
  signBrowserUpload,
  toStoragePath,
  uploadImage,
} from "@/lib/cloudinary";

const MAX_IMAGES = 12;
export const productImageFolder = (productId: string) => imageFolder("products", productId);

const metadataSchema = z.object({
  productId: z.uuid(),
  altText: z.string().trim().min(1).max(250),
  sortOrder: z.number().int().min(0).max(20),
});
const commitSchema = metadataSchema.extend({ publicId: z.string().min(1).max(300) });

const failure = (error: string, status: number) => Response.json({ error }, { status });
const notConfigured = () => failure(new CloudinaryNotConfiguredError().message, 503);

// Confirms the product exists and still has room for another image.
async function productAcceptsImage(db: SupabaseClient, productId: string) {
  const [{ data: product }, { count }] = await Promise.all([
    db.from("products").select("id").eq("id", productId).maybeSingle(),
    db.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", productId),
  ]);
  if (!product) return failure("Product could not be found.", 404);
  if ((count ?? 0) >= MAX_IMAGES) return failure(`A product can have up to ${MAX_IMAGES} images.`, 409);
  return null;
}

// Step 1 of a browser upload: signed parameters for uploading one photo into this product's folder.
export async function startProductImageUpload(db: SupabaseClient, body: unknown) {
  const parsed = z.object({ productId: z.uuid() }).safeParse(body);
  if (!parsed.success) return failure("Product could not be found.", 400);
  const refusal = await productAcceptsImage(db, parsed.data.productId);
  if (refusal) return refusal;
  try {
    return Response.json(signBrowserUpload(productImageFolder(parsed.data.productId)));
  } catch {
    return notConfigured();
  }
}

// Step 2 of a browser upload: records the photo the browser uploaded, after checking it with Cloudinary.
export async function commitProductImage(db: SupabaseClient, actor: AdminAuditActor, body: unknown) {
  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) return failure("The uploaded photo could not be recorded. Please try again.", 400);
  const { productId, publicId } = parsed.data;
  // The photo must sit in this product's folder so one product cannot claim another's upload.
  if (!publicId.startsWith(`${productImageFolder(productId)}/`)) return failure("The uploaded photo is invalid.", 400);
  let image: CloudinaryImage | null;
  try {
    image = await findImage(publicId);
  } catch {
    return notConfigured();
  }
  if (!image) return failure("The uploaded photo could not be found. Please try again.", 400);
  if (!isAcceptedUpload(image)) {
    await deleteImage(publicId);
    return failure("Use a JPG, PNG, WebP, or AVIF photo up to 5 MB.", 400);
  }
  return recordProductImage(db, actor, { ...parsed.data, image });
}

// Uploads a photo the server already holds. Used by the Google Form import.
export async function addProductImage(db: SupabaseClient, actor: AdminAuditActor, form: FormData | null) {
  const file = form?.get("file");
  const parsed = metadataSchema.safeParse({
    productId: form?.get("productId"),
    altText: form?.get("altText"),
    sortOrder: Number(form?.get("sortOrder")),
  });
  if (!parsed.success || !(file instanceof File)) return failure("Choose a valid image and describe it.", 400);
  if (!isAllowedImageFile(file)) return failure("Use a JPG, PNG, WebP, or AVIF image up to 5 MB.", 400);
  const refusal = await productAcceptsImage(db, parsed.data.productId);
  if (refusal) return refusal;
  let image: CloudinaryImage;
  try {
    image = await uploadImage(file, productImageFolder(parsed.data.productId));
  } catch (error) {
    return error instanceof CloudinaryNotConfiguredError ? notConfigured() : failure("Image upload failed.", 502);
  }
  return recordProductImage(db, actor, { ...parsed.data, image });
}

// Inserts the image row, writes the audit record and refreshes the storefront cache. Removes the photo
// from Cloudinary again if it cannot be recorded, so nothing is left behind.
async function recordProductImage(
  db: SupabaseClient,
  actor: AdminAuditActor,
  meta: { productId: string; altText: string; sortOrder: number; image: CloudinaryImage },
) {
  let previousValue: unknown;
  try {
    previousValue = await readAdminAuditState(db, { type: "product", id: meta.productId });
  } catch {
    await deleteImage(meta.image.publicId);
    return failure("The current product could not be verified for auditing.", 500);
  }
  const refusal = await productAcceptsImage(db, meta.productId);
  if (refusal) {
    await deleteImage(meta.image.publicId);
    return refusal;
  }
  const { data: image, error } = await db
    .from("product_images")
    .insert({
      product_id: meta.productId,
      url: meta.image.url,
      alt_text: meta.altText,
      sort_order: meta.sortOrder,
      storage_path: toStoragePath(meta.image.publicId),
    })
    .select("id,url,alt_text,sort_order,storage_path")
    .single();
  if (error || !image) {
    await deleteImage(meta.image.publicId);
    return failure("Image metadata could not be saved.", 500);
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
    return failure("The image was saved, but its audit record could not be verified.", 500);
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
