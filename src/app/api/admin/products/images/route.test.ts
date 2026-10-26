import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  productSingle: vi.fn(),
  imageCount: vi.fn(),
  imageSingle: vi.fn(),
  insert: vi.fn(),
  findImage: vi.fn(),
  deleteImage: vi.fn(),
  readAuditState: vi.fn(),
  recordAudit: vi.fn(),
}));
vi.mock("@/lib/audit/admin-audit-state", () => ({ readAdminAuditState: mocks.readAuditState }));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: mocks.recordAudit }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: vi.fn() }));
vi.mock("@/lib/cloudinary", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/cloudinary")>()),
  findImage: mocks.findImage,
  deleteImage: mocks.deleteImage,
}));
const db = {
  from: vi.fn((table: string) => {
    if (table === "products") return { select: () => ({ eq: () => ({ maybeSingle: mocks.productSingle }) }) };
    if (table === "product_images") {
      return {
        select: () => ({ eq: mocks.imageCount }),
        insert: (row: unknown) => {
          mocks.insert(row);
          return { select: () => ({ single: mocks.imageSingle }) };
        },
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
};
vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: () => Promise.resolve({ ok: true, db, admin: { id: "admin-id" }, sessionId: "session-id" }),
}));

import { POST } from "./route";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_ID = `ndee/products/${PRODUCT_ID}/photo`;
const uploaded = {
  publicId: PUBLIC_ID,
  url: "https://res.cloudinary.com/demo/photo.webp",
  bytes: 1024,
  format: "webp",
};

function request(body: unknown) {
  return new Request("http://localhost/api/admin/products/images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const commit = (overrides = {}) =>
  POST(request({ productId: PRODUCT_ID, publicId: PUBLIC_ID, altText: "Product artwork", sortOrder: 0, ...overrides }));

describe("POST /api/admin/products/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productSingle.mockResolvedValue({ data: { id: "product-id" } });
    mocks.imageCount.mockResolvedValue({ count: 0 });
    mocks.findImage.mockResolvedValue(uploaded);
    mocks.imageSingle.mockResolvedValue({
      data: {
        id: "image-id",
        url: uploaded.url,
        alt_text: "Product artwork",
        sort_order: 0,
        storage_path: `cloudinary:${PUBLIC_ID}`,
      },
      error: null,
    });
    mocks.readAuditState.mockResolvedValue({ id: PRODUCT_ID });
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("rejects a photo outside the product's own folder before asking Cloudinary", async () => {
    const response = await commit({ publicId: "ndee/products/22222222-2222-4222-8222-222222222222/evil" });

    expect(response.status).toBe(400);
    expect(mocks.findImage).not.toHaveBeenCalled();
  });

  it("rejects when the uploaded photo is missing", async () => {
    mocks.findImage.mockResolvedValue(null);
    const response = await commit();

    expect(response.status).toBe(400);
    expect(mocks.imageSingle).not.toHaveBeenCalled();
  });

  it("rejects and removes a photo whose real format is not allowed", async () => {
    mocks.findImage.mockResolvedValue({ ...uploaded, format: "svg" });
    const response = await commit();

    expect(response.status).toBe(400);
    expect(mocks.deleteImage).toHaveBeenCalledWith(PUBLIC_ID);
    expect(mocks.imageSingle).not.toHaveBeenCalled();
  });

  it("rejects and removes a photo larger than the limit", async () => {
    mocks.findImage.mockResolvedValue({ ...uploaded, bytes: 6 * 1024 * 1024 });
    const response = await commit();

    expect(response.status).toBe(400);
    expect(mocks.deleteImage).toHaveBeenCalledWith(PUBLIC_ID);
  });

  it("stores the Cloudinary URL and records the audit", async () => {
    const response = await commit();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      image: expect.objectContaining({ id: "image-id", altText: "Product artwork" }),
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ url: uploaded.url, storage_path: `cloudinary:${PUBLIC_ID}` }),
    );
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ sessionId: "session-id" }),
      expect.objectContaining({ action: "PRODUCT_IMAGE_ADDED" }),
    );
  });

  it("enforces the server-side image limit and removes the orphaned photo", async () => {
    mocks.imageCount.mockResolvedValue({ count: 12 });
    const response = await commit();

    expect(response.status).toBe(409);
    expect(mocks.deleteImage).toHaveBeenCalledWith(PUBLIC_ID);
    expect(mocks.imageSingle).not.toHaveBeenCalled();
  });
});
