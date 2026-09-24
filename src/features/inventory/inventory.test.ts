import { describe, expect, it } from "vitest";
import { products } from "@/test/fixtures";
import { deductInventory, IdempotencyLedger } from "./inventory";
describe("inventory", () => {
  it("deducts product and variant stock without mutating input", () => {
    const next = deductInventory(products, [{ productId: "p2", variantId: "v1", quantity: 2 }]);
    expect(next.find((p) => p.id === "p2")?.stockQuantity).toBe(22);
    expect(products.find((p) => p.id === "p2")?.stockQuantity).toBe(24);
  });
  it("prevents overselling the last unit", () => {
    expect(() => deductInventory(products, [{ productId: "p4", variantId: "v1", quantity: 7 }])).toThrow(/Only 6/);
  });
  it("leaves untracked inventory unchanged", () => {
    const untracked = {
      ...products[1],
      trackInventory: false,
      stockQuantity: 0,
      variants: products[1].variants.map((variant) => ({ ...variant, stockQuantity: 0 })),
    };
    const next = deductInventory(
      [untracked],
      [{ productId: untracked.id, variantId: untracked.variants[0].id, quantity: 50 }],
    );
    expect(next[0]).toEqual(untracked);
  });
  it("returns the same result for an idempotent retry", () => {
    const ledger = new IdempotencyLedger<number>();
    let calls = 0;
    expect(ledger.run("evt_1", () => ++calls)).toBe(1);
    expect(ledger.run("evt_1", () => ++calls)).toBe(1);
    expect(calls).toBe(1);
  });
});
