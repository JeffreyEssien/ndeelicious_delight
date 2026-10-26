import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "k".repeat(40);
const COLLECTION = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sessionUpdate: vi.fn(), admin: vi.fn(), taken: vi.fn() }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      if (table === "admins") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mocks.admin }) }) }) };
      if (table === "admin_sessions")
        return {
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: "session-id" }, error: null }) }) }),
          update: (value: unknown) => ({ eq: async () => mocks.sessionUpdate(value) }),
        };
      if (table === "categories")
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: "category-id" } }) }) }) };
      if (table === "collections")
        return {
          select: () => ({
            eq: () =>
              Object.assign(Promise.resolve({ data: [{ id: COLLECTION, name: "Cupcakes" }] }), {
                maybeSingle: async () => ({ data: { parent: "PASTRIES" } }),
              }),
          }),
        };
      if (table === "products")
        return {
          select: () => ({ like: mocks.taken }),
          update: () => ({ eq: async () => ({ error: null }) }),
        };
      throw new Error(`Unexpected table: ${table}`);
    },
  }),
}));
import { POST } from "./route";

const submission = {
  name: "Vanilla Cupcakes",
  category: "PASTRIES",
  collection: "cupcakes",
  shortDescription: "Soft vanilla cupcakes.",
  description: "Baked fresh with real vanilla.",
  price: 18,
  status: "ACTIVE",
  variants: [
    { name: "Box of 6", price: 18, packQuantity: 6 },
    { name: "Box of 12", price: 32.5, packQuantity: 12 },
  ],
};
const request = (body: unknown, key = KEY, submittedBy: string | null = "Second@Example.com") =>
  new Request("https://example.com/api/integrations/products", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, ...(submittedBy ? { "x-submitted-by": submittedBy } : {}) },
    body: JSON.stringify(body),
  });

describe("Google Form product import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("PRODUCT_IMPORT_API_KEY", KEY);
    vi.stubEnv("PRODUCT_IMPORT_ADMIN_EMAILS", "Owner@Example.com, second@example.com");
    mocks.admin.mockResolvedValue({ data: { id: "admin-id", email: "owner@example.com", active: true } });
    mocks.taken.mockResolvedValue({ data: [{ slug: "vanilla-cupcakes" }] });
    mocks.rpc.mockResolvedValue({ data: "product-id", error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("rejects a missing or wrong API key", async () => {
    expect((await POST(request(submission, "wrong"))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("only accepts admins on the allowlist", async () => {
    const outsider = await POST(request(submission, KEY, "someone@example.com"));
    expect(outsider.status).toBe(403);
    expect((await POST(request(submission, KEY, null))).status).toBe(400);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the only listed admin when no submitter is named", async () => {
    vi.stubEnv("PRODUCT_IMPORT_ADMIN_EMAILS", "owner@example.com");
    expect((await POST(request(submission, KEY, null))).status).toBe(201);
  });

  it("converts dollars to cents, picks a free slug and revokes its session", async () => {
    const response = await POST(request(submission));
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true, id: "product-id", slug: "vanilla-cupcakes-2", status: "ACTIVE" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "admin_save_product",
      expect.objectContaining({
        p_admin_id: "admin-id",
        p_session_id: "session-id",
        p_product: expect.objectContaining({
          base_price: 1800,
          slug: "vanilla-cupcakes-2",
          shopping_mode: "MADE_TO_ORDER",
        }),
        p_variants: [
          expect.objectContaining({ name: "Box of 6", packQuantity: 6, priceAdjustment: 0 }),
          expect.objectContaining({ name: "Box of 12", packQuantity: 12, priceAdjustment: 1450 }),
        ],
      }),
    );
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({ revoked_at: expect.any(String) });
  });

  it("reports an unknown sub-category without saving", async () => {
    const response = await POST(request({ ...submission, collection: "Cookies" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Cookies");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.sessionUpdate).toHaveBeenCalled();
  });

  it("surfaces product rules from the admin schema", async () => {
    const response = await POST(request({ ...submission, description: "" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("description: Add a full description.");
  });
});
