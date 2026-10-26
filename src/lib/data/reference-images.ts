import type { SupabaseClient } from "@supabase/supabase-js";
import { fromStoragePath, privateImageUrl } from "@/lib/cloudinary";

const LEGACY_BUCKET = "cake-reference-images";

// Customer cake reference photos are private. Newer ones live in Cloudinary as authenticated images;
// older ones stay in the Supabase bucket. Returns a viewable signed link for each stored path.
export async function signReferenceImageUrls(db: SupabaseClient, paths: string[], ttlSeconds: number) {
  const urls = new Map<string, string>();
  const legacy: string[] = [];
  for (const path of paths) {
    const publicId = fromStoragePath(path);
    if (publicId) urls.set(path, privateImageUrl(publicId));
    else legacy.push(path);
  }
  if (legacy.length) {
    const { data, error } = await db.storage.from(LEGACY_BUCKET).createSignedUrls(legacy, ttlSeconds);
    if (error) throw error;
    for (const image of data ?? []) if (image.path && image.signedUrl) urls.set(image.path, image.signedUrl);
  }
  return urls;
}
