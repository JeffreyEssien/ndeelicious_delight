import type { Product } from "@/types";
import type { CakeOption, CakeOptionType } from "@/types/content";
import { isProductPurchasable } from "@/features/catalog/availability";
import { calculateCakeConfigurationPrice } from "@/features/cakes/pricing";

export type BudgetPreset = { maximum: number; productCount: number };
export type CakeBudgetRecommendation = {
  id: string;
  total: number;
  selections: Record<CakeOptionType, CakeOption>;
};
export type CakeRecommendationBand = {
  maximum: number;
  recommendations: CakeBudgetRecommendation[];
};

const cakeSteps: CakeOptionType[] = ["occasion", "size", "flavour", "filling", "design"];

export function availableProductPrice(product: Product) {
  return product.discountPrice ?? product.price;
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

export function productsInBudget(products: Product[], maximum: number) {
  return products.filter(isProductPurchasable).filter((product) => availableProductPrice(product) <= maximum);
}

export function closestProductsAboveBudget(products: Product[], maximum: number, limit = 3) {
  return products
    .filter(isProductPurchasable)
    .filter((product) => availableProductPrice(product) > maximum)
    .sort((a, b) => availableProductPrice(a) - availableProductPrice(b))
    .slice(0, limit);
}

export function cakeRecommendations(options: CakeOption[], maximum: number, limit = 6): CakeBudgetRecommendation[] {
  const activeByType = new Map(
    cakeSteps.map((type) => [
      type,
      options
        .filter((option) => option.active && !option.quoteRequired && option.type === type)
        .sort((a, b) => a.priceAdjustment - b.priceAdjustment),
    ]),
  );
  if (cakeSteps.some((type) => !activeByType.get(type)?.length)) return [];

  type PartialChoice = { total: number; selected: Partial<Record<CakeOptionType, CakeOption>> };
  let candidates: PartialChoice[] = [{ total: 0, selected: {} }];
  for (const type of cakeSteps) {
    candidates = candidates
      .flatMap((candidate) =>
        (activeByType.get(type) ?? []).map((option) => ({
          total: candidate.total + option.priceAdjustment,
          selected: { ...candidate.selected, [type]: option },
        })),
      )
      .filter((candidate) => candidate.total <= maximum)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5_000);
  }

  const matching = candidates.map((candidate) => {
    const selections = candidate.selected as Record<CakeOptionType, CakeOption>;
    const pricing = calculateCakeConfigurationPrice(
      {
        occasion: selections.occasion.name,
        size: selections.size.name,
        flavour: selections.flavour.name,
        filling: selections.filling.name,
        design: selections.design.name,
      },
      options,
    );
    return {
      id: cakeSteps.map((type) => candidate.selected[type]?.id).join("-"),
      total: pricing.total,
      selections,
    };
  });
  const picked: CakeBudgetRecommendation[] = [];
  const signatures = new Set<string>();
  for (const candidate of matching) {
    const signature = ["size", "flavour", "filling", "design"]
      .map((type) => candidate.selections[type as CakeOptionType].id)
      .join(":");
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    picked.push(candidate);
    if (picked.length === limit) break;
  }
  return picked;
}

export function cakeRecommendationHref(recommendation: CakeBudgetRecommendation) {
  const query = new URLSearchParams();
  for (const type of cakeSteps) query.set(`${type}Id`, recommendation.selections[type].id);
  query.set("recommended", "1");
  return `/custom-cakes?${query.toString()}`;
}

export function cakeRecommendationBands(
  options: CakeOption[],
  maximum: number,
  bandCount = 3,
  recommendationsPerBand = 12,
): CakeRecommendationBand[] {
  if (maximum <= 0) return [];
  const rawMaximums = Array.from({ length: bandCount }, (_, index) =>
    friendlyMaximum((maximum * (index + 1)) / bandCount),
  );
  const maximums = [...new Set(rawMaximums.map((value) => Math.min(value, maximum)))];
  return maximums
    .map((bandMaximum) => ({
      maximum: bandMaximum,
      recommendations: cakeRecommendations(options, bandMaximum, recommendationsPerBand),
    }))
    .filter((band) => band.recommendations.length > 0);
}
