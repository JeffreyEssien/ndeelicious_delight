import { describe, expect, it } from "vitest";
import { parseHistoryQuery } from "./admin-history";
describe("admin history query boundaries", () => {
  it("defaults to a bounded first page", () => {
    expect(parseHistoryQuery("orders", new URLSearchParams())).toMatchObject({
      page: 1,
      size: 25,
      category: "ALL",
      sort: "newest",
    });
  });
  it.each([
    "size=10000",
    "page=0",
    "page=1.5",
    "from=2026-02-30",
    "from=2026-10-10&to=2026-01-01",
    "category=NOT_REAL",
    "sort=raw-sql",
    "asOf=2099-01-01T00%3A00%3A00Z",
  ])("rejects invalid query %s", (query) => {
    expect(() => parseHistoryQuery("orders", new URLSearchParams(query))).toThrow();
  });
  it("allows literal punctuation without interpolating filter syntax", () => {
    expect(parseHistoryQuery("orders", new URLSearchParams({ q: "Ada, O'Brian (%)" })).q).toBe("Ada, O'Brian (%)");
  });
  it("restricts categories to the selected workspace", () => {
    expect(() => parseHistoryQuery("orders", new URLSearchParams("category=NEEDS_QUOTE"))).toThrow();
    expect(parseHistoryQuery("cakes", new URLSearchParams("category=NEEDS_QUOTE")).category).toBe("NEEDS_QUOTE");
  });
});
