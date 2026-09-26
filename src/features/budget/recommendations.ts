import type { Product } from "@/types";
import type { CakeOption, CakeOptionType } from "@/types/content";

export type BudgetBand = { minimum: number; maximum: number; productCount: number };
export type CakeBudgetRecommendation = {
  id: string;
  total: number;
  selections: Record<CakeOptionType, CakeOption>;
};

const cakeSteps: CakeOptionType[] = ["occasion", "size", "flavour", "filling", "design"];

export function availableProductPrice(product: Product) {
  return product.discountPrice ?? product.price;
}

export function isAvailableProduct(product: Product) {
  return (
    product.status === "ACTIVE" &&
    product.variants.some(
      (variant) => variant.active !== false && (product.trackInventory === false || variant.stockQuantity > 0),
    )
  );
}

export function deriveBudgetBands(products: Product[], maximumBands = 4): BudgetBand[] {
  const prices = products
    .filter(isAvailableProduct)
    .map(availableProductPrice)
    .sort((a, b) => a - b);
  if (!prices.length) return [];
  const uniquePrices = [...new Set(prices)];
  const bandCount = Math.min(maximumBands, uniquePrices.length);
  const bands: BudgetBand[] = [];
  for (let index = 0; index < bandCount; index += 1) {
    const start = Math.floor((index * uniquePrices.length) / bandCount);
    const end = Math.max(start, Math.floor(((index + 1) * uniquePrices.length) / bandCount) - 1);
    const minimum = uniquePrices[start];
    const maximum = uniquePrices[end];
    bands.push({
      minimum,
      maximum,
      productCount: prices.filter((price) => price >= minimum && price <= maximum).length,
    });
  }
  return bands;
}

export function productsInBudget(products: Product[], minimum: number, maximum: number) {
  return products
    .filter(isAvailableProduct)
    .filter((product) => {
      const price = availableProductPrice(product);
      return price >= minimum && price <= maximum;
    })
    .sort((a, b) => availableProductPrice(b) - availableProductPrice(a));
}

export function cakeRecommendations(
  options: CakeOption[],
  minimum: number,
  maximum: number,
  limit = 6,
): CakeBudgetRecommendation[] {
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

  const matching = candidates
    .filter((candidate) => candidate.total >= minimum)
    .map((candidate) => ({
      id: cakeSteps.map((type) => candidate.selected[type]?.id).join("-"),
      total: candidate.total,
      selections: candidate.selected as Record<CakeOptionType, CakeOption>,
    }));
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
  for (const type of cakeSteps) query.set(type, recommendation.selections[type].name);
  query.set("recommended", "1");
  return `/custom-cakes?${query.toString()}`;
}
