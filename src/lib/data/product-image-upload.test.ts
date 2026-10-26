import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  productSingle: vi.fn(),
  imageCount: vi.fn(),
  imageSingle: vi.fn(),
  upload: vi.fn(),
  readAuditState: vi.fn(),
  recordAudit: vi.fn(),
}));
vi.mock("@/lib/audit/admin-audit-state", () => ({ readAdminAuditState: mocks.readAuditState }));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: mocks.recordAudit }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: vi.fn() }));
vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cloudinary")>()),
  uploadImage: mocks.upload,
  deleteImage: vi.fn(),
}));

const db = {
  from: vi.fn((table: string) => {
    if (table === "products") return { select: () => ({ eq: () => ({ maybeSingle: mocks.productSingle }) }) };
    if (table === "product_images") {
      return {
        select: () => ({ eq: mocks.imageCount }),
        insert: () => ({ select: () => ({ single: mocks.imageSingle }) }),
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
  // biome-ignore lint/suspicious/noExplicitAny: test double for SupabaseClient
} as any;
const actor = { admin: { id: "admin-id" }, sessionId: "session-id" } as never;

import { addProductImage } from "./product-image-upload";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";

function form(file: File) {
  const data = new FormData();
  data.set("productId", PRODUCT_ID);
  data.set("altText", "Product artwork");
  data.set("sortOrder", "0");
  data.set("file", file);
  return data;
}

describe("addProductImage (server-side FormData upload)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productSingle.mockResolvedValue({ data: { id: "product-id" } });
    mocks.imageCount.mockResolvedValue({ count: 0 });
    mocks.upload.mockResolvedValue({
      publicId: `ndee/products/${PRODUCT_ID}/image`,
      url: "https://res.cloudinary.com/demo/image.png",
      bytes: 3,
      format: "png",
    });
    mocks.imageSingle.mockResolvedValue({
      data: {
        id: "image-id",
        url: "https://example.com/product.png",
        alt_text: "Product artwork",
        sort_order: 0,
        storage_path: `cloudinary:ndee/products/${PRODUCT_ID}/image`,
      },
      error: null,
    });
    mocks.readAuditState.mockResolvedValue({ id: PRODUCT_ID });
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("rejects SVG uploads before uploading", async () => {
    const response = await addProductImage(
      db,
      actor,
      form(new File(["<svg />"], "image.svg", { type: "image/svg+xml" })),
    );

    expect(response.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("stores an allowed raster image and its metadata", async () => {
    const response = await addProductImage(db, actor, form(new File(["png"], "image.png", { type: "image/png" })));

    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledWith(expect.any(File), `ndee/products/${PRODUCT_ID}`);
    await expect(response.json()).resolves.toEqual({
      image: expect.objectContaining({ id: "image-id", altText: "Product artwork" }),
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      actor,
      expect.objectContaining({ action: "PRODUCT_IMAGE_ADDED" }),
    );
  });

  it("enforces the server-side image limit before uploading", async () => {
    mocks.imageCount.mockResolvedValue({ count: 12 });
    const response = await addProductImage(db, actor, form(new File(["png"], "image.png", { type: "image/png" })));

    expect(response.status).toBe(409);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
