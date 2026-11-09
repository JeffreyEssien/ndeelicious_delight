import { expect, it } from "vitest";
import { productImportSchema, toProductInput } from "./product-import";
import { CUSTOM_CAKE_PREPARATION_HOURS } from "./product";

const imported = (answers: Record<string, unknown>) =>
  toProductInput(productImportSchema.parse({ name: "Cake", price: 50, ...answers }), "cake", null);

it("gives imported cakes without a preparation time the cake default, and keeps an owner's own time", () => {
  expect(imported({ category: "CUSTOM_CAKES" }).preparationHours).toBe(CUSTOM_CAKE_PREPARATION_HOURS);
  expect(imported({ category: "CUSTOM_CAKES", preparationHours: 48 }).preparationHours).toBe(48);
  expect(imported({ category: "PASTRIES" }).preparationHours).toBe(0);
});
