import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/auth/admin-request", () => ({ requireAdminRequest: mocks.auth }));
import { GET } from "./route";
import { GET as exportHistory } from "./export/route";
const context = { params: Promise.resolve({ kind: "orders" }) };
const row = {
  id: "1",
  number: "ORD-1",
  customer: '=HYPERLINK("bad")',
  status: "PREPARING",
  createdAt: "2026-01-01",
  total: 100,
  currency: "CAD",
  fulfilment: "pickup",
  paymentStatus: "SUCCEEDED",
  deadline: null,
  occasion: null,
  items: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    db: { rpc: mocks.rpc, storage: { from: () => ({ createSignedUrls: mocks.sign }) } },
    admin: { id: "admin" },
    sessionId: "session",
  });
  mocks.rpc.mockResolvedValue({
    data: { rows: [row], total: 1, counts: { ALL: 101 }, page: 1, size: 25, asOf: "2026-01-01T00:00:00Z" },
    error: null,
  });
});
describe("authorized history routes", () => {
  it("rejects unauthenticated reads before querying data", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) });
    expect((await GET(new Request("http://localhost/api/admin/history/orders"), context)).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("signs only first references on the authorized cake page and removes storage paths", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        rows: [{ ...row, referencePath: "private/first.jpg" }],
        total: 5001,
        counts: { ALL: 5001 },
        page: 1,
        size: 25,
        asOf: "2026-01-01T00:00:00Z",
      },
      error: null,
    });
    mocks.sign.mockResolvedValue({
      data: [{ path: "private/first.jpg", signedUrl: "https://example.com/signed?token=fixture" }],
      error: null,
    });
    const response = await GET(new Request("http://localhost/api/admin/history/cakes"), {
      params: Promise.resolve({ kind: "cakes" }),
    });
    const data = await response.json();
    expect(data.rows[0].referencePath).toBeUndefined();
    expect(data.rows[0].thumbnailUrl).toContain("signed?token");
    expect(mocks.sign).toHaveBeenCalledWith(["private/first.jpg"], 600);
  });
  it("passes complete filters to the bounded database RPC", async () => {
    const response = await GET(
      new Request("http://localhost/api/admin/history/orders?q=old&size=50&page=3&payment=FAILED"),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.rpc).toHaveBeenCalledWith("admin_history_page", {
      p_kind: "orders",
      p_filters: expect.objectContaining({ q: "old", size: 50, page: 3, payment: "FAILED" }),
    });
  });
  it("rejects invalid dates and unbounded requests", async () => {
    for (const query of ["size=10000", "from=2026-02-30", "page=-1"])
      expect((await GET(new Request(`http://localhost/api/admin/history/orders?${query}`), context)).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("reports database failures as retryable errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "missing migration" } });
    expect((await GET(new Request("http://localhost/api/admin/history/orders"), context)).status).toBe(503);
  });
  it("exports safe CSV through bounded pages with a fixed creation cutoff", async () => {
    mocks.rpc.mockImplementation(async (_name, args) => ({
      data: {
        rows: [{ ...row, number: `ORD-${args.p_filters.page}` }],
        total: 101,
        counts: { ALL: 101 },
        page: args.p_filters.page,
        size: 100,
        asOf: args.p_filters.asOf,
      },
      error: null,
    }));
    const response = await exportHistory(
      new Request("http://localhost/api/admin/history/orders/export?category=PREPARING"),
      context,
    );
    const csv = await response.text();
    expect(csv).toContain("ORD-1");
    expect(csv).toContain("ORD-2");
    expect(csv).toContain("'=HYPERLINK");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[0][1].p_filters.asOf).toBe(mocks.rpc.mock.calls[1][1].p_filters.asOf);
    expect(mocks.rpc.mock.calls[1][1].p_filters).toMatchObject({ size: 100, page: 2, category: "PREPARING" });
  });
});
