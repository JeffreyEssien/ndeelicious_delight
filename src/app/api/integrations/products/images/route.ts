import { withIntegrationAdmin } from "@/lib/auth/integration-request";
import { addProductImage } from "@/lib/data/product-image-upload";

export const runtime = "nodejs";

// Adds one photo to a product created by the Google Form import. Same fields as the admin upload.
export async function POST(request: Request) {
  return withIntegrationAdmin(request, async (auth) =>
    addProductImage(auth.db, auth, await request.formData().catch(() => null)),
  );
}
