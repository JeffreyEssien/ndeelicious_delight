import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ maybeSingle: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/auth/admin-request", () => ({
  requireAdminRequest: () =>
    Promise.resolve({
      ok: true,
      admin: { id: "22222222-2222-4222-8222-222222222222" },
      db: {
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.maybeSingle }) }) }),
        rpc: mocks.rpc,
      },
    }),
}));

import { PUT } from "./route";

const request = (presentation: unknown) =>
  new Request("http://localhost/api/admin/documents/document-id", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ presentation }),
  });

describe("PUT /api/admin/documents/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maybeSingle.mockResolvedValue({
      data: { presentation_snapshot: { payNowUrl: "https://checkout.example.test" } },
      error: null,
    });
    mocks.rpc.mockResolvedValue({ error: null });
  });

  it("persists presentation without dropping server-owned payment fields", async () => {
    const presentation = {
      notes: ["Handle with care"],
      footerMessage: "Thank you",
      design: "modern",
      accentColor: "#792f49",
      showSku: true,
      showBusinessTaxNumber: true,
      showPaymentDetails: true,
    };
    const response = await PUT(request(presentation), { params: Promise.resolve({ id: "document-id" }) });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("update_document_presentation", {
      p_document_id: "document-id",
      p_presentation: { payNowUrl: "https://checkout.example.test", ...presentation },
      p_admin_id: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("rejects invalid colors before reaching the database", async () => {
    const response = await PUT(
      request({
        notes: [],
        footerMessage: "",
        design: "classic",
        accentColor: "red",
        showSku: true,
        showBusinessTaxNumber: true,
        showPaymentDetails: true,
      }),
      { params: Promise.resolve({ id: "document-id" }) },
    );
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
