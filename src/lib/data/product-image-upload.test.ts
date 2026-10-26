import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  productSingle: vi.fn(),
  imageCount: vi.fn(),
  imageSingle: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  readAuditState: vi.fn(),
  recordAudit: vi.fn(),
}));
vi.mock("@/lib/audit/admin-audit-state", () => ({ readAdminAuditState: mocks.readAuditState }));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: mocks.recordAudit }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: vi.fn() }));

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
  storage: {
    from: vi.fn(() => ({ upload: mocks.upload, remove: mocks.remove, getPublicUrl: mocks.getPublicUrl })),
  },
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
    mocks.upload.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.com/product.png" } });
    mocks.imageSingle.mockResolvedValue({
      data: {
        id: "image-id",
        url: "https://example.com/product.png",
        alt_text: "Product artwork",
        sort_order: 0,
        storage_path: `${PRODUCT_ID}/image.png`,
      },
      error: null,
    });
    mocks.readAuditState.mockResolvedValue({ id: PRODUCT_ID });
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("rejects SVG uploads before storage access", async () => {
    const response = await addProductImage(db, actor, form(new File(["<svg />"], "image.svg", { type: "image/svg+xml" })));

    expect(response.status).toBe(400);
    expect(db.storage.from).not.toHaveBeenCalled();
  });

  it("stores an allowed raster image and its metadata", async () => {
    const response = await addProductImage(db, actor, form(new File(["png"], "image.png", { type: "image/png" })));

    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledOnce();
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
