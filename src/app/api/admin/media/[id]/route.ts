import { requireAdminRequest } from "@/lib/auth/admin-request";
import { deleteMedia, updateMedia } from "@/lib/data/media-library";

// Renames or re-describes a library image.
export async function PATCH(request: Request, context: RouteContext<"/api/admin/media/[id]">) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  return updateMedia(auth.db, auth, id, await request.json().catch(() => null));
}

// Removes a library image. One still used on the website needs ?force=true, sent after the admin confirms.
export async function DELETE(request: Request, context: RouteContext<"/api/admin/media/[id]">) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  return deleteMedia(auth.db, auth, id, new URL(request.url).searchParams.get("force") === "true");
}
