import type { Category, Product } from "@/types";

export type ShoppingMode = NonNullable<Product["shoppingMode"]>;

const categories: Category[] = ["PASTRIES", "READY_TO_BAKE", "CUSTOM_CAKES"];
const modes: ShoppingMode[] = ["READY_TO_ORDER", "MADE_TO_ORDER", "READY_TO_BAKE"];

export const shoppingModeLabels: Record<ShoppingMode, string> = {
  READY_TO_ORDER: "Ready to order",
  MADE_TO_ORDER: "Made to order",
  READY_TO_BAKE: "Ready to bake",
};

// Shop links come from editable content, so accept both "READY_TO_BAKE" and slug-style "ready-to-bake".
function normalise(value: string | undefined) {
  return value?.trim().toUpperCase().replaceAll("-", "_") ?? "";
}

export function parseShopCategory(value: string | undefined): Category | undefined {
  const category = normalise(value);
  return categories.find((item) => item === category);
}

export function parseShoppingMode(value: string | undefined): ShoppingMode | undefined {
  const mode = normalise(value);
  return modes.find((item) => item === mode);
}
