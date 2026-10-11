import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), preview: vi.fn() }));
vi.mock("@/lib/auth/admin-request", () => ({ requireAdminRequest: mocks.auth }));
vi.mock("@/lib/documents/service", () => ({ previewCakeQuote: mocks.preview }));
import { POST } from "./route";
const context = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
const request = (amount: number) =>
  new Request("http://localhost/preview", { method: "POST", body: JSON.stringify({ quotedTotal: amount }) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, db: {} });
  mocks.preview.mockResolvedValue({ status: "DRAFT — NOT SENT", total: 25000 });
});
describe("quote preview", () => {
  it("authorizes before reading private request information", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) });
    expect((await POST(request(25000), context)).status).toBe(401);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("validates positive integer prices", async () => {
    for (const amount of [-1, 0, 1.5, 1000000001]) expect((await POST(request(amount), context)).status).toBe(400);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("returns a private read-only preview", async () => {
    const response = await POST(request(25000), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ status: "DRAFT — NOT SENT", total: 25000 });
  });
  it("rejects unavailable or converted requests", async () => {
    mocks.preview.mockRejectedValue(new Error("converted"));
    expect((await POST(request(25000), context)).status).toBe(409);
  });
});
