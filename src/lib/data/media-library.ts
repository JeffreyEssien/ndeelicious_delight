import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { type AdminAuditActor, recordAdminAudit } from "@/lib/audit/admin-audit";
import {
  type CloudinaryImage,
  CloudinaryNotConfiguredError,
  deleteImage,
  findImage,
  fromStoragePath,
  imageFolder,
  isAcceptedUpload,
  signBrowserUpload,
  toStoragePath,
} from "@/lib/cloudinary";
import { builtInImages } from "@/content/built-in-images";
import { contentSectionNames, humanizeContentKey } from "@/content/content-sections";
import type { MediaItem, MediaSource, MediaUsage } from "@/types/media";

// The admin image library: every image the website shows, in one place. Uploaded library images are
// stored in `media_assets`; product photos, cake photos, images referenced from website content and
// the images that ship in /public are gathered alongside them. Customer cake reference photos are
// private and never listed.

export const libraryFolder = () => imageFolder("library");

const failure = (error: string, status: number) => Response.json({ error }, { status });
const notConfigured = () => failure(new CloudinaryNotConfiguredError().message, 503);

type AssetRow = {
  id: string;
  url: string;
  storage_path: string;
  title: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  bytes: number;
  format: string;
  created_at: string;
};
const assetFields = "id,url,storage_path,title,alt_text,width,height,bytes,format,created_at";

const IMAGE_LINK = /^(https?:\/\/|\/)[^\s]+\.(jpe?g|png|webp|avif|gif|svg)(\?.*)?$/i;
const isImageLink = (key: string, value: string) =>
  IMAGE_LINK.test(value.trim()) || (/image|logo|photo/i.test(key) && /^(https?:\/\/|\/)\S+$/.test(value.trim()));

// The same image can be written with or without percent-encoding ("/WhatsApp%20Image…").
export function mediaKey(url: string) {
  try {
    return decodeURI(url.trim());
  } catch {
    return url.trim();
  }
}

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// Every image link inside saved website content, with an owner-facing label for where it sits,
// such as "Website content › Homepage › Hero".
export function contentImageUsages(content: unknown): Array<{ url: string; usage: MediaUsage }> {
  const found: Array<{ url: string; usage: MediaUsage }> = [];
  const walk = (value: Json, path: Array<string | number>) => {
    if (typeof value === "string") {
      const key = String(path.at(-1) ?? "");
      if (value && isImageLink(key, value)) found.push({ url: value, usage: contentUsage(path) });
      return;
    }
    if (Array.isArray(value)) for (const [index, item] of value.entries()) walk(item, [...path, index]);
    else if (value && typeof value === "object")
      for (const [key, item] of Object.entries(value)) walk(item, [...path, key]);
  };
  // Customer wording never holds images, and it is by far the largest part.
  if (content && typeof content === "object")
    for (const [key, value] of Object.entries(content as Record<string, Json>))
      if (key !== "customerText") walk(value, [key]);
  return found;
}

function contentUsage(path: Array<string | number>): MediaUsage {
  const [section, ...rest] = path;
  // Drop the field name itself ("image"); list items read as "Categories 2".
  const parts: string[] = [];
  for (const part of rest.slice(0, -1)) {
    if (typeof part === "number" && parts.length) parts[parts.length - 1] += ` ${part + 1}`;
    else parts.push(humanizeContentKey(String(part)));
  }
  const sectionName = contentSectionNames[String(section)] ?? humanizeContentKey(String(section));
  return { label: ["Website content", sectionName, ...parts].join(" › "), href: "/admin/content" };
}

function fromAsset(row: AssetRow): MediaItem {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    altText: row.alt_text,
    source: "library",
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    bytes: row.bytes,
    format: row.format,
    createdAt: row.created_at,
    usedIn: [],
  };
}

// Reads everything the library shows. Each image appears once, with every place it is used.
export async function listMedia(db: SupabaseClient): Promise<MediaItem[]> {
  const [assets, images, products, cakes, settings] = await Promise.all([
    db.from("media_assets").select(assetFields).order("created_at", { ascending: false }),
    db.from("product_images").select("id,url,alt_text,product_id"),
    db.from("products").select("id,name"),
    db.from("cake_types").select("id,name,image"),
    db.from("site_settings").select("key,value"),
  ]);
  for (const result of [assets, images, products, cakes, settings]) if (result.error) throw result.error;

  const items = new Map<string, MediaItem>();
  const add = (url: string, create: () => Omit<MediaItem, "usedIn">, usage?: MediaUsage) => {
    if (!url) return;
    const key = mediaKey(url);
    let item = items.get(key);
    if (!item) {
      item = { ...create(), usedIn: [] };
      items.set(key, item);
    }
    if (usage && !item.usedIn.some((existing) => existing.label === usage.label)) item.usedIn.push(usage);
  };
  const keyed = (source: MediaSource, url: string) => `${source}:${mediaKey(url)}`;

  for (const row of (assets.data ?? []) as AssetRow[]) add(row.url, () => fromAsset(row));

  // Built-in files come first so they keep their own name when a product or page also uses them.
  for (const image of builtInImages)
    for (const label of image.usedIn.length ? image.usedIn : [undefined])
      add(
        image.path,
        () => ({
          id: keyed("built-in", image.path),
          url: encodeURI(image.path),
          title: image.title,
          altText: image.title,
          source: "built-in",
        }),
        label ? { label } : undefined,
      );

  const productNames = new Map((products.data ?? []).map((row) => [row.id as string, row.name as string]));
  for (const row of images.data ?? []) {
    const name = productNames.get(row.product_id) ?? "Product";
    add(
      row.url,
      () => ({
        id: keyed("product", row.url),
        url: row.url,
        title: name,
        altText: row.alt_text ?? "",
        source: "product",
      }),
      { label: `Product › ${name}`, href: "/admin/products" },
    );
  }
  for (const row of cakes.data ?? []) {
    if (!row.image) continue;
    add(
      row.image,
      () => ({ id: keyed("cake", row.image), url: row.image, title: row.name, altText: row.name, source: "cake" }),
      { label: `Cake › ${row.name}`, href: "/admin/cakes" },
    );
  }

  const setting = (key: string) => (settings.data ?? []).find((row) => row.key === key)?.value;
  const referenced = contentImageUsages(setting("content"));
  const logo = (setting("marketing") as { logoUrl?: string } | undefined)?.logoUrl;
  if (logo) referenced.push({ url: logo, usage: { label: "Marketing posts › Logo", href: "/admin/marketing" } });
  for (const { url, usage } of referenced)
    add(
      url,
      () => ({ id: keyed("content", url), url, title: titleFromUrl(url), altText: "", source: "content" }),
      usage,
    );
  return [...items.values()];
}

function titleFromUrl(url: string) {
  const file = mediaKey(url).split(/[?#]/)[0].split("/").filter(Boolean).at(-1) ?? "";
  return (
    file
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .slice(0, 120) || "Image"
  );
}

export async function listMediaResponse(db: SupabaseClient) {
  try {
    return Response.json({ items: await listMedia(db) });
  } catch {
    return failure("The image library could not be loaded. Please try again.", 500);
  }
}

// Step 1 of an upload: signed parameters for sending one image straight to the library folder.
export function startMediaUpload() {
  try {
    return Response.json(signBrowserUpload(libraryFolder()));
  } catch {
    return notConfigured();
  }
}

const detailsSchema = z.object({
  title: z.string().trim().max(120),
  altText: z.string().trim().max(300),
});
const commitSchema = detailsSchema.extend({ publicId: z.string().min(1).max(300) });

// Step 2 of an upload: records the image the browser uploaded, after checking it with Cloudinary.
export async function commitMediaUpload(db: SupabaseClient, actor: AdminAuditActor, body: unknown) {
  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) return failure("The uploaded image could not be recorded. Please try again.", 400);
  const { publicId, title, altText } = parsed.data;
  // Only images in the library folder can be claimed, never a product's or a customer's.
  if (!publicId.startsWith(`${libraryFolder()}/`)) return failure("The uploaded image is invalid.", 400);
  let image: CloudinaryImage | null;
  try {
    image = await findImage(publicId);
  } catch {
    return notConfigured();
  }
  if (!image) return failure("The uploaded image could not be found. Please try again.", 400);
  if (!isAcceptedUpload(image)) {
    await deleteImage(publicId);
    return failure("Use a JPG, PNG, WebP, or AVIF image up to 5 MB.", 400);
  }
  const { data, error } = await db
    .from("media_assets")
    .insert({
      url: image.url,
      storage_path: toStoragePath(image.publicId),
      title: title || "Untitled image",
      alt_text: altText,
      width: image.width ?? null,
      height: image.height ?? null,
      bytes: image.bytes,
      format: image.format,
      created_by: actor.admin.id,
    })
    .select(assetFields)
    .single();
  if (error || !data) {
    await deleteImage(publicId);
    return failure("The image could not be saved to the library.", 500);
  }
  const row = data as AssetRow;
  try {
    await recordAdminAudit(db, actor, {
      action: "MEDIA_ASSET_ADDED",
      entityType: "media_asset",
      entityId: row.id,
      newValue: row,
    });
  } catch {
    return failure("The image was saved, but its audit record could not be verified.", 500);
  }
  return Response.json({ item: fromAsset(row) }, { status: 201 });
}

async function findAsset(db: SupabaseClient, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const { data } = await db.from("media_assets").select(assetFields).eq("id", id).maybeSingle();
  return (data as AssetRow | null) ?? null;
}

export async function updateMedia(db: SupabaseClient, actor: AdminAuditActor, id: string, body: unknown) {
  const parsed = detailsSchema.safeParse(body);
  if (!parsed.success) return failure("Keep the name under 120 characters and the description under 300.", 400);
  const previous = await findAsset(db, id);
  if (!previous) return failure("That image is no longer in the library.", 404);
  const { data, error } = await db
    .from("media_assets")
    .update({
      title: parsed.data.title || "Untitled image",
      alt_text: parsed.data.altText,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(assetFields)
    .single();
  if (error || !data) return failure("The image details could not be saved.", 500);
  try {
    await recordAdminAudit(db, actor, {
      action: "MEDIA_ASSET_UPDATED",
      entityType: "media_asset",
      entityId: id,
      previousValue: previous,
      newValue: data,
    });
  } catch {
    return failure("The details were saved, but their audit record could not be verified.", 500);
  }
  return Response.json({ item: fromAsset(data as AssetRow) });
}

// Removes a library image. An image still shown somewhere on the website is kept, and the reply
// says where it is used, unless the admin confirmed deleting it anyway (`force`).
export async function deleteMedia(db: SupabaseClient, actor: AdminAuditActor, id: string, force = false) {
  const asset = await findAsset(db, id);
  if (!asset) return failure("That image is no longer in the library.", 404);
  let usedIn: MediaUsage[];
  try {
    usedIn = (await listMedia(db)).find((item) => item.id === id)?.usedIn ?? [];
  } catch {
    return failure("Could not check where the image is used. Please try again.", 500);
  }
  if (usedIn.length && !force)
    return Response.json(
      { error: "This image is still used on your website. Replace it there first.", usedIn },
      { status: 409 },
    );
  const { error } = await db.from("media_assets").delete().eq("id", id);
  if (error) return failure("The image could not be removed.", 500);
  const publicId = fromStoragePath(asset.storage_path);
  if (publicId) await deleteImage(publicId);
  try {
    await recordAdminAudit(db, actor, {
      action: "MEDIA_ASSET_DELETED",
      entityType: "media_asset",
      entityId: id,
      previousValue: asset,
      metadata: usedIn.length ? { deletedWhileUsedIn: usedIn.map((usage) => usage.label) } : {},
    });
  } catch {
    return failure("The image was removed, but its audit record could not be verified.", 500);
  }
  return Response.json({ ok: true });
}
