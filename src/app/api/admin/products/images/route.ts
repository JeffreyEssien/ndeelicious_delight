import { requireAdminRequest } from "@/lib/auth/admin-request";
import { addProductImage } from "@/lib/data/product-image-upload";

export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  return addProductImage(auth.db, auth, await request.formData().catch(() => null));
}
