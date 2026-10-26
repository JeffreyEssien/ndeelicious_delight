// Every photo is converted in the browser before upload, whatever it arrived as: iPhone HEIC, a
// mislabelled "temp_image_….WEBP" copied out of WhatsApp, a 12 MB camera original or a PNG screenshot.
// The result is always a WebP (JPEG where the browser cannot write WebP), at most MAX_EDGE pixels on
// its longest side and well under the 5 MB upload limit, so uploads are small, fast and never refused.
// Large enough for full-width product pages on high-density screens, small enough to upload quickly.
const MAX_EDGE = 2000;
const MAX_BYTES = 5 * 1024 * 1024;

export class UnsupportedImageError extends Error {
  constructor(fileName: string) {
    super(`${fileName} could not be opened as a photo. Try a screenshot of it, or save it as a JPG first.`);
    this.name = "UnsupportedImageError";
  }
}

export function scaledSize(width: number, height: number, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function prepareImageForUpload(file: File): Promise<File> {
  const bitmap = await decode(file);
  try {
    // Retry smaller if an unusually detailed photo is still over the limit after the first pass.
    for (const [maxEdge, quality] of [
      [MAX_EDGE, 0.82],
      [1400, 0.72],
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

// Reads the photo from its actual contents, not its name or label.
async function decode(file: File) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Chrome, Edge and Firefox cannot read iPhone HEIC photos. The converter is a large download, so it
    // only loads when such a photo turns up.
    try {
      const { heicTo } = await import("heic-to/next");
      return await heicTo({ blob: file, type: "bitmap" });
    } catch {
      throw new UnsupportedImageError(file.name);
    }
  }
}

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const { width, height } = scaledSize(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  // White behind transparent PNGs, which would otherwise turn black as JPEG.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  // Browsers without WebP encoding silently return PNG, which is far larger; use JPEG there.
  const webp = await toBlob("image/webp");
  return webp?.type === "image/webp" ? webp : toBlob("image/jpeg");
}
