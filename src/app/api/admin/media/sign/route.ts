import { requireAdminRequest } from "@/lib/auth/admin-request";
import { startMediaUpload } from "@/lib/data/media-library";

// Signed parameters so the browser can upload a library image straight to Cloudinary, bypassing
// the serverless request body limit.
export async function POST(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return auth.response;
  return startMediaUpload();
}
