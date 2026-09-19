import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = {
  productSingle: vi.fn(),
  imageCount: vi.fn(),
  imageSingle: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
};
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
};
vi.mock("@/lib/auth/admin-request", () => ({ requireAdminRequest: () => Promise.resolve({ ok: true, db }) }));

import { POST } from "./route";

describe("POST /api/admin/products/images", () => {
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
        storage_path: "product-id/image.png",
      },
      error: null,
    });
  });

  it("rejects SVG uploads before storage access", async () => {
    const form = new FormData();
    form.set("productId", "11111111-1111-4111-8111-111111111111");
    form.set("altText", "Product artwork");
    form.set("sortOrder", "0");
    form.set("file", new File(["<svg />"], "image.svg", { type: "image/svg+xml" }));
    const response = await POST(
      new Request("http://localhost/api/admin/products/images", { method: "POST", body: form }),
    );

    expect(response.status).toBe(400);
    expect(db.storage.from).not.toHaveBeenCalled();
  });

  it("stores an allowed raster image and its metadata", async () => {
    const form = new FormData();
    form.set("productId", "11111111-1111-4111-8111-111111111111");
    form.set("altText", "Product artwork");
    form.set("sortOrder", "0");
    form.set("file", new File(["png"], "image.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/admin/products/images", { method: "POST", body: form }),
    );

    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledOnce();
    await expect(response.json()).resolves.toEqual({
      image: expect.objectContaining({ id: "image-id", altText: "Product artwork" }),
    });
  });

  it("enforces the server-side image limit", async () => {
    mocks.imageCount.mockResolvedValue({ count: 12 });
    const form = new FormData();
    form.set("productId", "11111111-1111-4111-8111-111111111111");
    form.set("altText", "Product artwork");
    form.set("sortOrder", "0");
    form.set("file", new File(["png"], "image.png", { type: "image/png" }));
    const response = await POST(
      new Request("http://localhost/api/admin/products/images", { method: "POST", body: form }),
    );

    expect(response.status).toBe(409);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
