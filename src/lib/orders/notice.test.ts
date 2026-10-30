import { describe, expect, it } from "vitest";
import { earlyReadyMessage, isEarly } from "./notice";

describe("early ready reminder", () => {
  it("knows when the notice period is still running", () => {
    const now = Date.parse("2026-10-30T12:00:00Z");
    expect(isEarly("2026-10-30T13:00:00Z", now)).toBe(true);
    expect(isEarly("2026-10-30T11:00:00Z", now)).toBe(false);
    expect(isEarly(null, now)).toBe(false);
  });
  it("names the notice length and when it ends", () => {
    const order = { number: "ND-1", placedAt: "2026-10-30T12:00:00Z", readyAt: "2026-10-31T12:00:00Z" };
    const message = earlyReadyMessage([order], "en-CA", "UTC");
    expect(message).toContain("ND-1 is still inside its 24-hour notice period");
    expect(message).toContain("Mark it ready anyway?");
    expect(earlyReadyMessage([order, { ...order, number: "ND-2" }], "en-CA", "UTC")).toContain("ND-2: 24-hour notice");
  });
});
