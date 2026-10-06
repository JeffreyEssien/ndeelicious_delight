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

  it("uses the Halifax date at the Atlantic/Eastern midnight boundary", () => {
    expect(formatDate("2026-09-16T03:30:00Z")).toBe("Sep 16, 2026");
    expect(formatDate("2026-09-16T03:30:00Z", "en-CA", "America/Toronto")).toBe("Sep 15, 2026");
  });

  it("formats Canadian dollars from integer cents", () => {
    expect(formatMoney(4_650_000)).toBe("$46,500.00");
    expect(formatMoney(-250_000)).toBe("-$2,500.00");
  });
});
