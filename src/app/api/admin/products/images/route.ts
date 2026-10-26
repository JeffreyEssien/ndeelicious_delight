import { requireAdminRequest } from "@/lib/auth/admin-request";
import { commitProductImage } from "@/lib/data/product-image-upload";

// Records a photo the admin uploaded directly to Cloudinary (see the sign route). The browser sends only
// JSON metadata here, so this never hits the serverless request body limit.
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  return commitProductImage(auth.db, auth, await request.json().catch(() => null));
}
