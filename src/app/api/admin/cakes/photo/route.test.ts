import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), upload: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/admin-request", () => ({ requireAdminRequest: mocks.auth }));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: mocks.audit }));
import { POST } from "./route";
const storage = {
  upload: mocks.upload,
  remove: mocks.remove,
  getPublicUrl: () => ({ data: { publicUrl: "https://example.com/cake.jpg" } }),
};
function request(type = "image/jpeg", content = "photo") {
  const form = new FormData();
  form.set("file", new File([content], "cake.jpg", { type }));
  return new Request("http://localhost/api/admin/cakes/photo", { method: "POST", body: form });
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    ok: true,
    db: { storage: { from: () => storage } },
    admin: { id: "admin" },
    sessionId: "session",
  });
  mocks.upload.mockResolvedValue({ error: null });
});
describe("cake photo upload", () => {
  it("requires administrator authorization", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: Response.json({}, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("rejects unsupported, empty and oversized uploads", async () => {
    for (const input of [
      request("image/svg+xml"),
      request("image/jpeg", ""),
      request("image/jpeg", "x".repeat(5 * 1024 * 1024 + 1)),
    ])
      expect((await POST(input)).status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("uploads an audited asset without publishing or changing a cake", async () => {
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ url: "https://example.com/cake.jpg" });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ action: "CAKE_PHOTO_UPLOADED" }),
    );
  });
  it("removes the uploaded asset if its required audit fails", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect(mocks.remove).toHaveBeenCalledOnce();
  });
});
