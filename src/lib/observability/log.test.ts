import { afterEach, describe, expect, it, vi } from "vitest";
import { logError, logInfo } from "./log";

afterEach(() => vi.restoreAllMocks());

describe("privacy-safe operational logging", () => {
  it("does not emit provider messages containing customer data or credentials", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError(
      "stripe.checkout_webhook_failed",
      Object.assign(
        new Error(
          "Authorization: Bearer sk_live_example; customer@example.com; https://bakery.test/document/opaque-secret",
        ),
        { code: "PAYMENT_FAILED" },
      ),
      { orderId: "order-1", token: "secret", email: "customer@example.com" },
    );
    const line = String(output.mock.calls[0][0]);
    expect(line).not.toMatch(/sk_live|customer@|opaque-secret|"token"|"email"/);
    expect(JSON.parse(line)).toMatchObject({ orderId: "order-1", errorCode: "PAYMENT_FAILED", level: "error" });
  });
  it("preserves correlation and prevents metadata from replacing log identity", () => {
    const output = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logInfo("application.runtime_started", { requestId: "request-1", level: "error", event: "forged" });
    expect(JSON.parse(String(output.mock.calls[0][0]))).toMatchObject({
      requestId: "request-1",
      level: "info",
      event: "application.runtime_started",
    });
  });
  it("does not serialize thrown non-Error objects", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("request.unhandled_error", { password: "secret" });
    expect(String(output.mock.calls[0][0])).not.toContain("secret");
  });
});
