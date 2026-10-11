import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), single: vi.fn(), update: vi.fn(), issue: vi.fn(), queue: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/auth/admin-request", () => ({ requireAdminRequest: mocks.auth }));
vi.mock("@/lib/audit/admin-audit-state", () => ({ readAdminAuditState: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/audit/admin-audit", () => ({ recordAdminAudit: vi.fn() }));
vi.mock("@/lib/documents/service", () => ({ issueCakeQuote: mocks.issue }));
vi.mock("@/lib/cakes/notifications", () => ({ queueCakeQuoteEmail: mocks.queue, deliverCakeQuoteEmail: vi.fn() }));
vi.mock("@/lib/cache/storefront", () => ({ invalidateStorefrontCache: vi.fn() }));
import { POST } from "./route";
import { signQuoteApproval } from "@/lib/documents/quote-approval";
const id = "11111111-1111-4111-8111-111111111111";
const approval = {
  requestId: id,
  quotedTotal: 12000,
  revision: 3,
  updatedAt: "2026-10-11",
  expiresAt: Date.now() + 600000,
};
const request = (token: string) =>
  new Request("http://localhost/api/admin/mutate", {
    method: "POST",
    body: JSON.stringify({ action: "cake-quote", id, quotedTotal: 12000, approvalToken: token }),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_AUTH_SECRET", "isolated-quote-approval-secret-32-characters");
  const query = {
    select: () => query,
    eq: () => query,
    is: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: mocks.single,
    update: (value: unknown) => {
      mocks.update(value);
      return query;
    },
  };
  mocks.auth.mockResolvedValue({ ok: true, db: { from: () => query }, admin: { id: "admin" }, sessionId: "session" });
  mocks.issue.mockResolvedValue({ id: "document" });
  mocks.queue.mockResolvedValue("delivery");
});
describe("quote send verifies the reviewed request", () => {
  it("rejects a preview from another request before updating a quote", async () => {
    expect((await POST(request(signQuoteApproval({ ...approval, requestId: "another-request" })))).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("rejects a revision changed by another administrator", async () => {
    mocks.single.mockResolvedValueOnce({ data: { revision: 4 } });
    expect((await POST(request(signQuoteApproval(approval)))).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("rejects changed or converted requests when the conditional update affects no row", async () => {
    mocks.single.mockResolvedValueOnce({ data: { revision: 3 } }).mockResolvedValueOnce({ data: null });
    expect((await POST(request(signQuoteApproval(approval)))).status).toBe(409);
    expect(mocks.issue).not.toHaveBeenCalled();
  });
  it("issues only the reviewed amount after both revision and conditional update succeed", async () => {
    mocks.single.mockResolvedValueOnce({ data: { revision: 3 } }).mockResolvedValueOnce({ data: { id } });
    expect((await POST(request(signQuoteApproval(approval)))).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ quoted_total: 12000 }));
    expect(mocks.issue).toHaveBeenCalledWith(expect.anything(), id, "admin", { quotedTotal: 12000, revision: 3 });
  });
});
