import { describe, expect, it, vi } from "vitest";
import { readAdminAuditState } from "./admin-audit-state";

describe("readAdminAuditState", () => {
  it("reads server-owned product state instead of trusting a submitted previous value", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "product-id", base_price: 125 }, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));

    await expect(
      readAdminAuditState({ from: () => ({ select }) } as never, { type: "product", id: "product-id" }),
    ).resolves.toEqual({ id: "product-id", base_price: 125 });
    expect(eq).toHaveBeenCalledWith("id", "product-id");
  });

  it("propagates snapshot failures so a sensitive mutation is not silently unaudited", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: new Error("database unavailable") });
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
    await expect(readAdminAuditState(db as never, { type: "review", id: "review-id" })).rejects.toThrow(
      "database unavailable",
    );
  });
});
