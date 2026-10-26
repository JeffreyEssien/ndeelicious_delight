import { requireAdminRequest } from "@/lib/auth/admin-request";
import { recordAdminAudit } from "@/lib/audit/admin-audit";
import {
  type CloudinaryImage,
  CloudinaryNotConfiguredError,
  deleteImage,
  imageFolder,
  isAllowedImageFile,
  uploadImage,
} from "@/lib/cloudinary";

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !isAllowedImageFile(file))
    return Response.json({ error: "Choose a JPG, PNG, WebP or AVIF photo up to 5 MB." }, { status: 400 });
  let image: CloudinaryImage;
  try {
    image = await uploadImage(file, imageFolder("cake-types"));
  } catch (error) {
    const message =
      error instanceof CloudinaryNotConfiguredError ? error.message : "Photo upload failed. Please retry.";
    return Response.json({ error: message }, { status: 503 });
  }
  try {
    await recordAdminAudit(auth.db, auth, {
      action: "CAKE_PHOTO_UPLOADED",
      entityType: "cake_asset",
      metadata: { publicId: image.publicId },
      newValue: { url: image.url },
    });
  } catch {
    await deleteImage(image.publicId);
    return Response.json({ error: "Photo upload could not be audited. Please retry." }, { status: 503 });
  }
  return Response.json({ url: image.url }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
