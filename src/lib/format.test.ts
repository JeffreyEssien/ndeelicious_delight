import { describe, expect, it } from "vitest";
import { formatDate, formatMoney } from "./format";

describe("deterministic display formatting", () => {
  it("formats dates without runtime-specific locale abbreviations", () => {
    expect(formatDate("2026-09-15")).toBe("15 Sep 2026");
  });

  it("uses UTC consistently for timestamp inputs", () => {
    expect(formatDate("2026-09-15T23:30:00-02:00")).toBe("16 Sep 2026");
  });

  it("rejects invalid dates", () => {
    expect(() => formatDate("not-a-date")).toThrow(RangeError);
  });

  it("formats naira values without locale-dependent spacing", () => {
    expect(formatMoney(4_650_000)).toBe("₦46,500");
    expect(formatMoney(-250_000)).toBe("−₦2,500");
  });
});
