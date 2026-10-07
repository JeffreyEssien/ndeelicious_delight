import { calculateCakeConfigurationPrice } from "@/features/cakes/pricing";
import type { Product } from "@/types";
import type { CakeOption, CakeOptionType } from "@/types/content";
import { productStartingPrice, variantPrice } from "@/features/catalog/pricing";
import { getPurchasableVariants, isProductPurchasable } from "@/features/catalog/availability";
import { optionsForCakeType } from "@/features/cakes/options";
import { leadTimeHours } from "@/features/cakes/lead-time";
import type { CakeType } from "@/validations/cake-type";

export type BudgetPreset = { maximum: number; productCount: number };
export type CakeBudgetRecommendation = {
  id: string;
  total: number;
  cakeType: CakeType;
  pricingMode: "EXACT_PRICE" | "STARTING_FROM" | "QUOTE_REQUIRED";
  leadTimeHours: number;
  selections: Partial<Record<CakeOptionType, CakeOption>>;
};
export type CakeRecommendationBand = {
  maximum: number;
  recommendations: CakeBudgetRecommendation[];
};

const cakeSteps: CakeOptionType[] = ["occasion", "size", "flavour", "filling", "design"];

export function availableProductPrice(product: Product) {
  return productStartingPrice(product);
}

function friendlyMaximum(value: number) {
  const increment = value <= 5_000 ? 500 : value <= 20_000 ? 1_000 : value <= 100_000 ? 5_000 : 10_000;
  return Math.ceil(value / increment) * increment;
}

export function deriveBudgetPresets(products: Product[], maximumPresets = 4): BudgetPreset[] {
  const prices = products
    .filter(isProductPurchasable)
    .map(availableProductPrice)
    .sort((a, b) => a - b);
  if (!prices.length) return [];
  const presetCount = Math.min(maximumPresets, prices.length);
  const thresholds = Array.from({ length: presetCount }, (_, index) => {
    const position = Math.ceil(((index + 1) * prices.length) / presetCount) - 1;
    return friendlyMaximum(prices[position]);
  });
  return [...new Set(thresholds)].map((maximum) => ({
    maximum,
    productCount: prices.filter((price) => price <= maximum).length,
  }));
}

export function purchasableBudgetOptions(products: Product[]) {
  return products
    .flatMap((product) =>
      getPurchasableVariants(product).map((variant) => ({ product, variant, price: variantPrice(product, variant) })),
    )
    .filter((option) => option.price >= 0);
}
export function productsInBudget(products: Product[], maximum: number) {
  return products
    .filter(isProductPurchasable)
    .map((product) => ({
      ...product,
      variants: getPurchasableVariants(product).filter((variant) => variantPrice(product, variant) <= maximum),
    }))
    .filter((product) => product.variants.length > 0);
}

export function closestProductsAboveBudget(products: Product[], maximum: number, limit = 3) {
  return products
    .filter(isProductPurchasable)
    .filter((product) => availableProductPrice(product) > maximum)
    .sort((a, b) => availableProductPrice(a) - availableProductPrice(b))
    .slice(0, limit);
}

export function cakeRecommendations(input: {
  cakeTypes: CakeType[];
  options: CakeOption[];
  relationships: { cakeTypeId: string; optionId: string }[];
  maximum: number;
  limit?: number;
}): CakeBudgetRecommendation[] {
  if (!Number.isSafeInteger(input.maximum) || input.maximum <= 0) return [];
  const results: CakeBudgetRecommendation[] = [];
  for (const cakeType of input.cakeTypes) {
    if (!cakeType.active || cakeType.basePrice == null || leadTimeHours(cakeType) <= 0) continue;
    const allowed = optionsForCakeType(input, cakeType.id);
    if (cakeSteps.some((step) => !allowed.some((option) => option.type === step))) continue;
    let candidates: { total: number; selections: Partial<Record<CakeOptionType, CakeOption>>; quote: boolean }[] = [
      { total: cakeType.basePrice, selections: {}, quote: false },
    ];
    for (const step of cakeSteps) {
      const choices = allowed
        .filter((option) => option.type === step)
        .sort((a, b) => a.priceAdjustment - b.priceAdjustment || a.id.localeCompare(b.id));
      candidates = candidates
        .flatMap((candidate) =>
          choices.map((option) => ({
            total: candidate.total + option.priceAdjustment,
            selections: { ...candidate.selections, [step]: option },
            quote: candidate.quote || option.quoteRequired,
          })),
        )
        .filter((candidate) => candidate.total <= input.maximum);
      // Keep the cheapest paths as well as near-budget paths so future steps cannot erase all valid configurations.
      candidates.sort((a, b) => a.total - b.total);
      if (candidates.length > 5000) candidates = [...candidates.slice(0, 2500), ...candidates.slice(-2500)];
    }
    for (const candidate of candidates) {
      const selected = candidate.selections;
      const canonical = calculateCakeConfigurationPrice(
        {
          occasion: selected.occasion?.name ?? "",
          size: selected.size?.name ?? "",
          flavour: selected.flavour?.name ?? "",
          filling: selected.filling?.name ?? "",
          design: selected.design?.name ?? "",
          optionIds: Object.fromEntries(cakeSteps.map((step) => [step, selected[step]?.id])),
        },
        allowed,
        cakeType,
      );
      results.push({
        id: `${cakeType.id}:${cakeSteps.map((step) => candidate.selections[step]?.id).join(":")}`,
        cakeType,
        total: canonical.total,
        pricingMode: candidate.quote
          ? Object.values(candidate.selections).every((option) => option.quoteRequired)
            ? "QUOTE_REQUIRED"
            : "STARTING_FROM"
          : "EXACT_PRICE",
        selections: candidate.selections,
        leadTimeHours: leadTimeHours(cakeType),
      });
    }
  }
  return results
    .sort((a, b) => b.total - a.total || a.cakeType.sortOrder - b.cakeType.sortOrder || a.id.localeCompare(b.id))
    .slice(0, input.limit ?? 6);
}

export function cakeRecommendationHref(recommendation: CakeBudgetRecommendation) {
  const query = new URLSearchParams();
  query.set("cakeTypeId", recommendation.cakeType.id);
  for (const type of cakeSteps) {
    const option = recommendation.selections[type];
    if (option) query.set(`${type}Id`, option.id);
  }
  query.set("recommended", "1");
  return `/custom-cakes?${query.toString()}`;
}

export function cakeRecommendationBands(
  input: Omit<Parameters<typeof cakeRecommendations>[0], "maximum" | "limit">,
  maximum: number,
  bandCount = 3,
  recommendationsPerBand = 12,
): CakeRecommendationBand[] {
  if (maximum <= 0) return [];
  const maximums = [
    ...new Set(
      Array.from({ length: bandCount }, (_, index) =>
        Math.min(maximum, friendlyMaximum((maximum * (index + 1)) / bandCount)),
      ),
    ),
  ];
  return maximums
    .map((value) => ({
      maximum: value,
      recommendations: cakeRecommendations({ ...input, maximum: value, limit: recommendationsPerBand }),
    }))
    .filter((band) => band.recommendations.length);
}

export function cakeBudgetState(
  input: Omit<Parameters<typeof cakeRecommendations>[0], "limit">,
): "AVAILABLE" | "UNAVAILABLE" | "SETUP_REQUIRED" | "INCOMPLETE" | "QUOTE_REQUIRED" | "BELOW_BUDGET" {
  const active = input.cakeTypes.filter((type) => type.active);
  if (!active.length) return "UNAVAILABLE";
  if (active.every((type) => type.basePrice == null)) return "SETUP_REQUIRED";
  const configured = active.filter(
    (type) =>
      type.basePrice != null &&
      cakeSteps.every((step) => optionsForCakeType(input, type.id).some((option) => option.type === step)),
  );
  if (!configured.length) return "INCOMPLETE";
  if (cakeRecommendations({ ...input, limit: 1 }).length) return "AVAILABLE";
  if (configured.every((type) => optionsForCakeType(input, type.id).every((option) => option.quoteRequired)))
    return "QUOTE_REQUIRED";
  return "BELOW_BUDGET";
}
