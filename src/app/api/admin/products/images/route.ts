import { requireAdminRequest } from "@/lib/auth/admin-request";
import { commitSignedProductImage } from "@/lib/data/product-image-upload";

// Records an image the admin uploaded directly to storage via a signed URL (see the sign route). The
// browser sends only JSON metadata here, so this never hits the serverless request body limit.
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  return commitSignedProductImage(auth.db, auth, await request.json().catch(() => null));
}
