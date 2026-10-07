import type { CakeOption, CakeConfigurationData } from "@/types/content";
export function optionsForCakeType(
  configuration: Pick<CakeConfigurationData, "options" | "relationships">,
  cakeTypeId: string,
): CakeOption[] {
  const allowed = new Set(
    (configuration.relationships ?? []).filter((link) => link.cakeTypeId === cakeTypeId).map((link) => link.optionId),
  );
  return configuration.options.filter((option) => option.active && allowed.has(option.id));
}
