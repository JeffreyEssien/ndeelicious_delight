import type { CakeType } from "@/validations/cake-type";
import type { CakeConfiguration } from "@/types";
import type { CakeOption } from "@/types/content";
import { CommerceError } from "@/features/checkout/pricing";

const pricedCakeSteps = ["occasion", "size", "flavour", "filling", "design"] as const;
// Only these choices are mandatory; the rest are optional and simply priced if chosen.
const requiredCakeSteps: ReadonlySet<(typeof pricedCakeSteps)[number]> = new Set(["size", "flavour"]);

export function calculateCakeConfigurationPrice(
  config: Pick<CakeConfiguration, (typeof pricedCakeSteps)[number] | "optionIds">,
  options: CakeOption[],
  cakeType: CakeType | undefined,
) {
  if (!cakeType || cakeType.basePrice == null)
    throw new CommerceError(
      "CAKE_SETUP_REQUIRED",
      "This cake type needs a base price. Contact the bakery for a quote.",
    );
  const selected = pricedCakeSteps.map((type) => {
    const value = config[type];
    if (!value) {
      if (requiredCakeSteps.has(type)) throw new CommerceError("INCOMPLETE_CAKE", `Choose a ${type} for your cake.`);
      return undefined; // Optional choice the customer skipped — contributes no price.
    }
    const id = config.optionIds?.[type];
    const matches = options.filter(
      (option) =>
        option.type === type &&
        option.active &&
        (id ? option.id === id && option.name === value : option.name === value),
    );
    if (matches.length !== 1)
      throw new CommerceError("INVALID_CAKE_OPTION", "One of the selected cake options is unavailable.");
    return matches[0];
  });
  const total = selected.reduce((sum, option) => sum + (option?.priceAdjustment ?? 0), cakeType.basePrice);
  if (!Number.isSafeInteger(total) || total < 0 || total > 2147483647)
    throw new CommerceError("INVALID_CAKE_PRICE", "This cake price needs review.");
  return {
    total,
    quoteRequired: selected.some((option) => option?.quoteRequired),
    selected: selected.filter((option): option is CakeOption => Boolean(option)),
  };
}
