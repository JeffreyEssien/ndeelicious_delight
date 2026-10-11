import { describe, expect, it } from "vitest";
import { parseInventoryCsv } from "./inventory-csv";
const header = "productId,variantId,expected,mode,quantity,product\r\n";
const row =
  '"11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222",12,set,15,"Cake, with cream"';
describe("inventory CSV review", () => {
  it("accepts exported quoted CSV and preserves the concurrency expectation", () => {
    expect(parseInventoryCsv(header + row)[0]).toMatchObject({ expected: 12, quantity: 15, mode: "set" });
  });
  it("rejects duplicates, malformed quantities, missing columns and oversized imports", () => {
    for (const text of [
      header + row + "\n" + row,
      header + row.replace(",12,set", ",-1,set"),
      "quantity\n1",
      header + row.replace(",15,", ",1.5,"),
      header + '"unfinished',
    ])
      expect(() => parseInventoryCsv(text)).toThrow();
  });
});
