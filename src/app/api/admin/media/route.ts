import { requireAdminRequest } from "@/lib/auth/admin-request";
import { commitMediaUpload, listMediaResponse } from "@/lib/data/media-library";

// Every image on the website, for the admin image library and image pickers.
export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  return listMediaResponse(auth.db);
}

// Records an image the admin uploaded straight to Cloudinary (see the sign route).
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  return commitMediaUpload(auth.db, auth, await request.json().catch(() => null));
}
