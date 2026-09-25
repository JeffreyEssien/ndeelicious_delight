import { describe, expect, it, vi } from "vitest";
import { AdminAuditError, recordAdminAudit } from "./admin-audit";

describe("recordAdminAudit", () => {
  it("binds an audit entry to the validated admin and session", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    await recordAdminAudit(
      { rpc } as never,
      { admin: { id: "admin-id" }, sessionId: "session-id" },
      {
        action: "PRODUCT_UPDATED",
        entityType: "product",
        entityId: "product-id",
        previousValue: { price: 100 },
        newValue: { price: 125 },
      },
    );

    expect(rpc).toHaveBeenCalledWith("record_admin_audit", {
      p_admin_id: "admin-id",
      p_admin_session_id: "session-id",
      p_action: "PRODUCT_UPDATED",
      p_entity_type: "product",
      p_entity_id: "product-id",
      p_previous_value: { price: 100 },
      p_new_value: { price: 125 },
      p_metadata: {},
    });
  });

  it("fails loudly when the required audit record cannot be persisted", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { message: "database unavailable" } });
    await expect(
      recordAdminAudit(
        { rpc } as never,
        { admin: { id: "admin-id" }, sessionId: "session-id" },
        { action: "STOCK_CHANGED", entityType: "product" },
      ),
    ).rejects.toBeInstanceOf(AdminAuditError);
  });
});
