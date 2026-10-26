import { requireAdminRequest } from "@/lib/auth/admin-request";
import { startProductImageUpload } from "@/lib/data/product-image-upload";

// Returns signed parameters so the browser can upload a photo straight to Cloudinary, bypassing the
// serverless function body limit (4.5 MB on Vercel Hobby) that a proxied upload would hit.
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  return startProductImageUpload(auth.db, await request.json().catch(() => null));
}
