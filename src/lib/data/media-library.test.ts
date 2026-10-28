import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findImage: vi.fn(),
  deleteImage: vi.fn(),
  recordAudit: vi.fn(),
}));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: mocks.recordAudit }));
vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cloudinary")>()),
  findImage: mocks.findImage,
  deleteImage: mocks.deleteImage,
}));

import { builtInImages } from "@/content/built-in-images";
import { commitMediaUpload, contentImageUsages, deleteMedia, listMedia, mediaKey } from "./media-library";

const ASSET_ID = "22222222-2222-4222-8222-222222222222";
const LIBRARY_URL = "https://res.cloudinary.com/demo/image/upload/v1/ndee/library/banner.webp";
const asset = {
  id: ASSET_ID,
  url: LIBRARY_URL,
  storage_path: "cloudinary:ndee/library/banner",
  title: "Banner",
  alt_text: "Autumn banner",
  width: 1600,
  height: 900,
  bytes: 2048,
  format: "webp",
  created_at: "2026-10-28T10:00:00Z",
};

// A thenable query result that also answers the chained calls the module makes.
function result(data: unknown) {
  const promise = Promise.resolve({ data, error: null });
  return Object.assign(promise, {
    order: () => promise,
    eq: () => ({ maybeSingle: () => Promise.resolve({ data: Array.isArray(data) ? data[0] : data, error: null }) }),
  });
}

function fakeDb(tables: Record<string, unknown[]>) {
  const inserted: unknown[] = [];
  const deleted: string[] = [];
  const db = {
    inserted,
    deleted,
    from: vi.fn((table: string) => ({
      select: () => result(tables[table] ?? []),
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: () => Promise.resolve({ data: { ...asset, ...row }, error: null }) }) };
      },
      delete: () => ({
        eq: (_: string, id: string) => {
          deleted.push(id);
          return Promise.resolve({ error: null });
        },
      }),
    })),
  };
  return db;
}

const actor = { admin: { id: "admin-id" }, sessionId: "session-id" };
const content = (image: string) => ({
  home: { hero: { image, imageAlt: "Hero" }, categories: [{ image: "/pastries.jpg" }, { image: LIBRARY_URL }] },
  customerText: { emails: { "Hello {name},": "Hello {name}," } },
});

describe("image library", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("finds image links in website content with readable locations", () => {
    expect(contentImageUsages(content("https://example.com/hero.jpg"))).toEqual([
      {
        url: "https://example.com/hero.jpg",
        usage: { label: "Website content › Homepage › Hero", href: "/admin/content" },
      },
      { url: "/pastries.jpg", usage: { label: "Website content › Homepage › Categories 1", href: "/admin/content" } },
      { url: LIBRARY_URL, usage: { label: "Website content › Homepage › Categories 2", href: "/admin/content" } },
    ]);
  });

  it("lists each image once with every place it is used", async () => {
    const db = fakeDb({
      media_assets: [asset],
      product_images: [
        { id: "p1", url: "https://res.cloudinary.com/demo/pie.webp", alt_text: "Pie", product_id: "prod" },
      ],
      products: [{ id: "prod", name: "Chicken pies" }],
      cake_types: [{ id: "c1", name: "Vanilla", image: LIBRARY_URL }],
      site_settings: [{ key: "content", value: content("/hero-bakery.jpg") }],
    });
    const items = await listMedia(db as never);
    const library = items.find((item) => item.id === ASSET_ID);
    expect(library?.source).toBe("library");
    expect(library?.usedIn.map((usage) => usage.label)).toEqual([
      "Cake › Vanilla",
      "Website content › Homepage › Categories 2",
    ]);
    const hero = items.find((item) => item.url === "/hero-bakery.jpg");
    expect(hero?.source).toBe("built-in");
    expect(hero?.usedIn.map((usage) => usage.label)).toEqual(["Contact page", "Website content › Homepage › Hero"]);
    expect(items.find((item) => item.source === "product")?.usedIn).toEqual([
      { label: "Product › Chicken pies", href: "/admin/products" },
    ]);
    // Every built-in image is listed, even when nothing uses it.
    for (const image of builtInImages) expect(items.some((item) => mediaKey(item.url) === image.path)).toBe(true);
  });

  it("only records uploads from the library folder", async () => {
    const db = fakeDb({});
    const response = await commitMediaUpload(db as never, actor, {
      publicId: "ndee/products/someone-else/photo",
      title: "Photo",
      altText: "",
    });
    expect(response.status).toBe(400);
    expect(mocks.findImage).not.toHaveBeenCalled();
  });

  it("records a verified upload with its size and an audit entry", async () => {
    mocks.findImage.mockResolvedValue({
      publicId: "ndee/library/banner",
      url: LIBRARY_URL,
      bytes: 2048,
      format: "webp",
      width: 1600,
      height: 900,
    });
    const db = fakeDb({});
    const response = await commitMediaUpload(db as never, actor, {
      publicId: "ndee/library/banner",
      title: "Banner",
      altText: "Autumn banner",
    });
    expect(response.status).toBe(201);
    expect(db.inserted[0]).toMatchObject({ url: LIBRARY_URL, width: 1600, height: 900, created_by: "admin-id" });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      actor,
      expect.objectContaining({ action: "MEDIA_ASSET_ADDED", entityType: "media_asset" }),
    );
  });

  it("refuses an upload Cloudinary does not accept and removes it", async () => {
    mocks.findImage.mockResolvedValue({ publicId: "ndee/library/big", url: LIBRARY_URL, bytes: 9e6, format: "webp" });
    const response = await commitMediaUpload(fakeDb({}) as never, actor, {
      publicId: "ndee/library/big",
      title: "",
      altText: "",
    });
    expect(response.status).toBe(400);
    expect(mocks.deleteImage).toHaveBeenCalledWith("ndee/library/big");
  });

  it("keeps an image that is still used on the website", async () => {
    const db = fakeDb({
      media_assets: [asset],
      site_settings: [{ key: "content", value: content(LIBRARY_URL) }],
    });
    const response = await deleteMedia(db as never, actor, ASSET_ID);
    expect(response.status).toBe(409);
    expect((await response.json()).usedIn).toHaveLength(2);
    expect(db.deleted).toEqual([]);
    expect(mocks.deleteImage).not.toHaveBeenCalled();
  });

  it("deletes an image that is in use once the admin confirms", async () => {
    const db = fakeDb({
      media_assets: [asset],
      site_settings: [{ key: "content", value: content(LIBRARY_URL) }],
    });
    const response = await deleteMedia(db as never, actor, ASSET_ID, true);
    expect(response.status).toBe(200);
    expect(db.deleted).toEqual([ASSET_ID]);
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      actor,
      expect.objectContaining({
        action: "MEDIA_ASSET_DELETED",
        metadata: { deletedWhileUsedIn: expect.arrayContaining(["Website content › Homepage › Hero"]) },
      }),
    );
  });

  it("deletes an unused image from the library and from Cloudinary", async () => {
    const db = fakeDb({ media_assets: [asset] });
    const response = await deleteMedia(db as never, actor, ASSET_ID);
    expect(response.status).toBe(200);
    expect(db.deleted).toEqual([ASSET_ID]);
    expect(mocks.deleteImage).toHaveBeenCalledWith("ndee/library/banner");
  });

  it("lists every image file in /public as a built-in image", () => {
    const root = path.resolve("public");
    const files = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return files(full);
        return /\.(jpe?g|png|webp|avif|gif|svg)$/i.test(entry.name) ? [`/${path.relative(root, full)}`] : [];
      });
    expect(builtInImages.map((image) => image.path).sort()).toEqual(files(root).sort());
  });
});
