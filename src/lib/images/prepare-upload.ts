// Phone photos are often 4–12 MB and several thousand pixels wide. Shrink them in the browser before
// upload so admins never have to resize photos themselves and every upload stays under the 5 MB limit.
const UPLOADABLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
// Small enough to upload quickly, large enough for full-width product pages on high-density screens.
const MAX_EDGE = 2400;
const KEEP_AS_IS_BYTES = 2 * 1024 * 1024;
const MAX_BYTES = 5 * 1024 * 1024;

export class UnsupportedImageError extends Error {
  constructor(fileName: string) {
    super(
      `${fileName} could not be read. Use a JPG or PNG photo (on iPhone: Settings → Camera → Formats → Most Compatible).`,
    );
    this.name = "UnsupportedImageError";
  }
}

export function scaledSize(width: number, height: number, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function prepareImageForUpload(file: File): Promise<File> {
  if (UPLOADABLE_TYPES.has(file.type) && file.size > 0 && file.size <= KEEP_AS_IS_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new UnsupportedImageError(file.name);
  }
  try {
    // Retry smaller if an unusually detailed photo is still over the limit after the first pass.
    for (const [maxEdge, quality] of [
      [MAX_EDGE, 0.85],
      [1600, 0.75],
    ] as const) {
      const blob = await encode(bitmap, maxEdge, quality);
      if (blob && blob.size <= MAX_BYTES) {
        const extension = blob.type === "image/webp" ? "webp" : "jpg";
        return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.${extension}`, { type: blob.type });
      }
    }
  } finally {
    bitmap.close();
  }
  throw new Error(`${file.name} is still too large after resizing. Try a different photo.`);
}

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // Browsers without WebP encoding silently return PNG, which is far larger; use JPEG there.
  const webp = await toBlob("image/webp");
  return webp?.type === "image/webp" ? webp : toBlob("image/jpeg");
}
