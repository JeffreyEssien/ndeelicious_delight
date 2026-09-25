import { describe, expect, it } from "vitest";
import { formatDate, formatMoney } from "./format";

describe("deterministic display formatting", () => {
  it("formats dates without runtime-specific locale abbreviations", () => {
    expect(formatDate("2026-09-15")).toBe("Sep 15, 2026");
  });

  it("uses the configured Canadian timezone for timestamp inputs", () => {
    expect(formatDate("2026-09-15T23:30:00-02:00")).toBe("Sep 15, 2026");
  });

  it("rejects invalid dates", () => {
    expect(() => formatDate("not-a-date")).toThrow(RangeError);
  });

  it("formats Canadian dollars from integer cents", () => {
    expect(formatMoney(4_650_000)).toBe("$46,500.00");
    expect(formatMoney(-250_000)).toBe("-$2,500.00");
  });
});
