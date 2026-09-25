import { z } from "zod";
import { recordAdminAudit } from "@/lib/audit/admin-audit";
import { readAdminAuditState } from "@/lib/audit/admin-audit-state";
import { requireAdminRequest } from "@/lib/auth/admin-request";

const metadataSchema = z.object({
  productId: z.uuid(),
  altText: z.string().trim().min(1).max(250),
  sortOrder: z.number().int().min(0).max(20),
});
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const parsed = metadataSchema.safeParse({
    productId: form?.get("productId"),
    altText: form?.get("altText"),
    sortOrder: Number(form?.get("sortOrder")),
  });
  if (!parsed.success || !(file instanceof File)) {
    return Response.json({ error: "Choose a valid image and provide alternative text." }, { status: 400 });
  }
  const extension = extensions[file.type];
  if (!extension || file.size === 0 || file.size > 5 * 1024 * 1024) {
    return Response.json({ error: "Use a JPG, PNG, WebP, or AVIF image up to 5 MB." }, { status: 400 });
  }

  const { db } = auth;
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
  const bucket = db.storage.from("product-images");
  const { error: uploadError } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) return Response.json({ error: "Image upload failed." }, { status: 500 });
  const { data: publicUrl } = bucket.getPublicUrl(path);
  const { data: image, error } = await db
    .from("product_images")
    .insert({
      product_id: parsed.data.productId,
      url: publicUrl.publicUrl,
      alt_text: parsed.data.altText,
      sort_order: parsed.data.sortOrder,
      storage_path: path,
    })
    .select("id,url,alt_text,sort_order,storage_path")
    .single();
  if (error || !image) {
    await bucket.remove([path]);
    return Response.json({ error: "Image metadata could not be saved." }, { status: 500 });
  }
  try {
    const newValue = await readAdminAuditState(db, { type: "product", id: parsed.data.productId });
    await recordAdminAudit(db, auth, {
      action: "PRODUCT_IMAGE_ADDED",
      entityType: "product",
      entityId: parsed.data.productId,
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
