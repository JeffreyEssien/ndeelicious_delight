import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  productSingle: vi.fn(),
  imageCount: vi.fn(),
  imageSingle: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  readAuditState: vi.fn(),
  recordAudit: vi.fn(),
}));
vi.mock("@/lib/audit/admin-audit-state", () => ({ readAdminAuditState: mocks.readAuditState }));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: mocks.recordAudit }));
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
    from: vi.fn(() => ({ info: mocks.info, remove: mocks.remove, getPublicUrl: mocks.getPublicUrl })),
  },
};
vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: () => Promise.resolve({ ok: true, db, admin: { id: "admin-id" }, sessionId: "session-id" }),
}));

import { POST } from "./route";

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const PATH = `${PRODUCT_ID}/image.png`;

function request(body: unknown) {
  return new Request("http://localhost/api/admin/products/images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/products/images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productSingle.mockResolvedValue({ data: { id: "product-id" } });
    mocks.imageCount.mockResolvedValue({ count: 0 });
    mocks.info.mockResolvedValue({ data: { size: 1024, contentType: "image/png" }, error: null });
    mocks.remove.mockResolvedValue({ error: null });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: "https://example.com/product.png" } });
    mocks.imageSingle.mockResolvedValue({
      data: {
        id: "image-id",
        url: "https://example.com/product.png",
        alt_text: "Product artwork",
        sort_order: 0,
        storage_path: PATH,
      },
      error: null,
    });
    mocks.readAuditState.mockResolvedValue({ id: PRODUCT_ID });
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("rejects a path outside the product's own folder before touching storage", async () => {
    const response = await POST(
      request({ productId: PRODUCT_ID, path: "22222222-2222-4222-8222-222222222222/evil.png", altText: "x", sortOrder: 0 }),
    );

    expect(response.status).toBe(400);
    expect(db.storage.from).not.toHaveBeenCalled();
  });

  it("rejects when the uploaded object is missing", async () => {
    mocks.info.mockResolvedValue({ data: null, error: { message: "not found" } });
    const response = await POST(request({ productId: PRODUCT_ID, path: PATH, altText: "Product artwork", sortOrder: 0 }));

    expect(response.status).toBe(400);
    expect(mocks.imageSingle).not.toHaveBeenCalled();
  });

  it("rejects and removes an object whose real type is not allowed", async () => {
    mocks.info.mockResolvedValue({ data: { size: 1024, contentType: "image/svg+xml" }, error: null });
    const response = await POST(request({ productId: PRODUCT_ID, path: PATH, altText: "Product artwork", sortOrder: 0 }));

    expect(response.status).toBe(400);
    expect(mocks.remove).toHaveBeenCalledWith([PATH]);
    expect(mocks.imageSingle).not.toHaveBeenCalled();
  });

  it("rejects and removes an object larger than the limit", async () => {
    mocks.info.mockResolvedValue({ data: { size: 6 * 1024 * 1024, contentType: "image/png" }, error: null });
    const response = await POST(request({ productId: PRODUCT_ID, path: PATH, altText: "Product artwork", sortOrder: 0 }));

    expect(response.status).toBe(400);
    expect(mocks.remove).toHaveBeenCalledWith([PATH]);
  });

  it("stores verified metadata and records the audit", async () => {
    const response = await POST(request({ productId: PRODUCT_ID, path: PATH, altText: "Product artwork", sortOrder: 0 }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      image: expect.objectContaining({ id: "image-id", altText: "Product artwork" }),
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ sessionId: "session-id" }),
      expect.objectContaining({ action: "PRODUCT_IMAGE_ADDED" }),
    );
  });

  it("enforces the server-side image limit and removes the orphaned object", async () => {
    mocks.imageCount.mockResolvedValue({ count: 12 });
    const response = await POST(request({ productId: PRODUCT_ID, path: PATH, altText: "Product artwork", sortOrder: 0 }));

    expect(response.status).toBe(409);
    expect(mocks.remove).toHaveBeenCalledWith([PATH]);
    expect(mocks.imageSingle).not.toHaveBeenCalled();
  });
});
