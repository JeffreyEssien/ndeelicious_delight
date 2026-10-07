import { earliestCakeDate, leadTimeHours } from "./lead-time";
import type { CakeType } from "@/validations/cake-type";
import type { CakeConfiguration } from "@/types";
import type { CakeOption } from "@/types/content";
import { CommerceError } from "@/features/checkout/pricing";

const pricedCakeSteps = ["occasion", "size", "flavour", "filling", "design"] as const;

export function calculateCakeConfigurationPrice(
  config: Pick<CakeConfiguration, (typeof pricedCakeSteps)[number]>,
  options: CakeOption[],
) {
  for (const key of pricedCakeSteps)
    if (!config[key]) throw new CommerceError("INCOMPLETE_CAKE", `Choose a ${key} for your cake.`);
  const selected = pricedCakeSteps.map((type) =>
    options.find((option) => option.type === type && option.name === config[type] && option.active),
  );
  if (selected.some((option) => !option))
    throw new CommerceError("INVALID_CAKE_OPTION", "One of the selected cake options is unavailable.");
  return {
    total: selected.reduce((total, option) => total + (option?.priceAdjustment ?? 0), 0),
    quoteRequired: selected.some((option) => option?.quoteRequired),
    selected: selected as CakeOption[],
  };
}

export function calculateCakeQuote(
  config: CakeConfiguration,
  options: CakeOption[],
  input: { now?: Date; cakeType: CakeType; timezone: string },
) {
  const pricing = calculateCakeConfigurationPrice(config, options);
  const now = input.now ?? new Date();
  if (!input.cakeType?.active || input.cakeType.id !== config.cakeTypeId || leadTimeHours(input.cakeType) <= 0)
    throw new CommerceError("INVALID_CAKE_TYPE", "Choose an available cake type with a configured lead time.");
  const earliestDay = earliestCakeDate(input.cakeType, input.timezone, now);
  const earliest = new Date(`${earliestDay}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(config.deliveryDate) || config.deliveryDate < earliestDay)
    throw new CommerceError("INVALID_CAKE_DATE", "Choose a date with enough preparation time.");
  return { estimatedTotal: pricing.total, quoteRequired: pricing.quoteRequired, earliestDate: earliest };
}
