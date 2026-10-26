import { v2 as cloudinary } from "cloudinary";

// All site images live in Cloudinary under this folder. Public images (products, cake types) use the
// normal "upload" delivery type; customer cake reference photos use "authenticated", so they can only be
// opened through a signed link generated for the admin.
const ROOT_FOLDER = "ndee";
export const IMAGE_FORMATS = ["jpg", "png", "webp", "avif"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

// Image rows keep a storage_path; Cloudinary ones are prefixed so older Supabase paths stay readable.
const STORAGE_PREFIX = "cloudinary:";
export const toStoragePath = (publicId: string) => `${STORAGE_PREFIX}${publicId}`;
export const fromStoragePath = (path: string | null | undefined) =>
  path?.startsWith(STORAGE_PREFIX) ? path.slice(STORAGE_PREFIX.length) : null;

export type DeliveryType = "upload" | "authenticated";
export type CloudinaryImage = { publicId: string; url: string; bytes: number; format: string };

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super("Image uploads are not set up yet. Add the Cloudinary settings to the server.");
    this.name = "CloudinaryNotConfiguredError";
  }
}

function settings() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
  if (!cloudName || !apiKey || !apiSecret) throw new CloudinaryNotConfiguredError();
  // Optional API host override (Cloudinary regional endpoints, or the local browser-test fixtures).
  const apiBase = process.env.CLOUDINARY_UPLOAD_PREFIX?.trim() || "https://api.cloudinary.com";
  return { cloudName, apiKey, apiSecret, apiBase };
}

function client() {
  const { cloudName, apiKey, apiSecret, apiBase } = settings();
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
    upload_prefix: apiBase,
  });
  return cloudinary;
}

export const imageFolder = (...parts: string[]) => [ROOT_FOLDER, ...parts].join("/");

export function isAllowedImageFile(file: Blob) {
  return CONTENT_TYPES.has(file.type) && file.size > 0 && file.size <= MAX_IMAGE_BYTES;
}

// Signed parameters that let the browser upload one image straight to Cloudinary, into one folder only,
// without the file passing through our server (which has a 4.5 MB request limit on Vercel).
export function signBrowserUpload(folder: string) {
  const { cloudName, apiKey, apiSecret, apiBase } = settings();
  const params = { allowed_formats: IMAGE_FORMATS.join(","), folder, timestamp: Math.round(Date.now() / 1000) };
  return {
    uploadUrl: `${apiBase}/v1_1/${cloudName}/image/upload`,
    fields: { ...params, api_key: apiKey, signature: client().utils.api_sign_request(params, apiSecret) },
  };
}

// Calls Cloudinary's upload API with a signed request. The SDK is only used for signing: its HTTP client
// insists on https, which would rule out regional or local test endpoints.
async function signedPost(action: "upload" | "destroy", params: Record<string, string | number>, file?: Blob | string) {
  const { cloudName, apiKey, apiSecret, apiBase } = settings();
  const signedParams = { ...params, timestamp: Math.round(Date.now() / 1000) };
  const form = new FormData();
  for (const [key, value] of Object.entries(signedParams)) form.set(key, String(value));
  form.set("api_key", apiKey);
  form.set("signature", cloudinary.utils.api_sign_request(signedParams, apiSecret));
  if (file) form.set("file", file);
  const response = await fetch(`${apiBase}/v1_1/${cloudName}/image/${action}`, { method: "POST", body: form });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message ?? `Cloudinary ${action} failed (${response.status}).`);
  return body;
}

const toImage = (body: { public_id: string; secure_url: string; bytes: number; format: string }): CloudinaryImage => ({
  publicId: body.public_id,
  url: body.secure_url,
  bytes: body.bytes,
  format: body.format,
});

// Uploads an image the server already holds (form submissions), or copies one from a URL.
export async function uploadImage(
  source: Blob | string,
  folder: string,
  type: DeliveryType = "upload",
): Promise<CloudinaryImage> {
  return toImage(await signedPost("upload", { allowed_formats: IMAGE_FORMATS.join(","), folder, type }, source));
}

// Looks up an uploaded image so a browser's claim about what it uploaded is never trusted as is.
export async function findImage(publicId: string, type: DeliveryType = "upload"): Promise<CloudinaryImage | null> {
  const { cloudName, apiKey, apiSecret, apiBase } = settings();
  const response = await fetch(`${apiBase}/v1_1/${cloudName}/resources/image/${type}/${encodeURIComponent(publicId)}`, {
    cache: "no-store",
    headers: { authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString("base64")}` },
  }).catch(() => null);
  if (!response?.ok) return null;
  return toImage(await response.json());
}

export async function deleteImage(publicId: string, type: DeliveryType = "upload") {
  try {
    await signedPost("destroy", { invalidate: "true", public_id: publicId, type });
  } catch {
    // Best effort: an orphaned image costs storage but never breaks the page.
  }
}

// A signed link to a private (authenticated) image, for admin screens only.
export function privateImageUrl(publicId: string) {
  return client().url(publicId, { type: "authenticated", sign_url: true, secure: true, resource_type: "image" });
}

export function isAcceptedUpload(image: CloudinaryImage) {
  return (IMAGE_FORMATS as readonly string[]).includes(image.format) && image.bytes <= MAX_IMAGE_BYTES;
}
