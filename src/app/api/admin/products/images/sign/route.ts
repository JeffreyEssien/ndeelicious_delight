import { z } from "zod";
import { requireAdminRequest } from "@/lib/auth/admin-request";
import { IMAGE_BUCKET, imageExtension } from "@/lib/data/product-image-upload";

const schema = z.object({
  productId: z.uuid(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
});

// Issues a short-lived signed URL so the browser can upload the file straight to Supabase Storage,
// bypassing the serverless function body limit (4.5 MB on Vercel Hobby) that a proxied POST would hit.
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Choose a valid image type (JPG, PNG, WebP, or AVIF)." }, { status: 400 });
  }

  const { db } = auth;
  const [{ data: product }, { count: imageCount }] = await Promise.all([
    db.from("products").select("id").eq("id", parsed.data.productId).maybeSingle(),
    db.from("product_images").select("id", { count: "exact", head: true }).eq("product_id", parsed.data.productId),
  ]);
  if (!product) return Response.json({ error: "Product could not be found." }, { status: 404 });
  if ((imageCount ?? 0) >= 12) return Response.json({ error: "A product can have up to 12 images." }, { status: 409 });

  const extension = imageExtension(parsed.data.contentType);
  const path = `${parsed.data.productId}/${crypto.randomUUID()}.${extension}`;
  const { data, error } = await db.storage.from(IMAGE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return Response.json({ error: "Could not prepare the upload. Please try again." }, { status: 500 });
  return Response.json({ path: data.path, token: data.token });
}
