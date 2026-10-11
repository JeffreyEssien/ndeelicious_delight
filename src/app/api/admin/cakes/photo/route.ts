import { requireAdminRequest } from "@/lib/auth/admin-request";
import { recordAdminAudit } from "@/lib/audit/admin-audit";
const formats: Record<string, string> = {
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
  if (!(file instanceof File) || !formats[file.type] || !file.size || file.size > 5 * 1024 * 1024)
    return Response.json({ error: "Choose a JPG, PNG, WebP or AVIF photo up to 5 MB." }, { status: 400 });
  const path = `cake-types/${crypto.randomUUID()}.${formats[file.type]}`;
  const bucket = auth.db.storage.from("product-images");
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (error) return Response.json({ error: "Photo upload failed. Please retry." }, { status: 503 });
  const { data } = bucket.getPublicUrl(path);
  try {
    await recordAdminAudit(auth.db, auth, {
      action: "CAKE_PHOTO_UPLOADED",
      entityType: "cake_asset",
      metadata: { path },
      newValue: { url: data.publicUrl },
    });
  } catch {
    await bucket.remove([path]);
    return Response.json({ error: "Photo upload could not be audited. Please retry." }, { status: 503 });
  }
  return Response.json({ url: data.publicUrl }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
