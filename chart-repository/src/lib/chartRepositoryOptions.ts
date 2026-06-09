export type SelectOption = {
  label: string;
  value: string;
};

export const hazardOptions = [
  { label: "Storm", value: "storm" },
  { label: "Extreme heat", value: "extreme_heat" },
  { label: "Increased temperature", value: "increased_temperature" },
  { label: "Earthquake", value: "earthquake" },
  { label: "Flood", value: "flood" },
  { label: "Sea level rise", value: "sea_level_rise" },
  { label: "Cold wave", value: "cold_wave" },
  { label: "Drought", value: "drought" },
  { label: "Wildfire", value: "wildfire" },
  { label: "Increased CO2 levels", value: "increased_co2_levels" },
  { label: "Landslide", value: "landslide" },
  { label: "Tsunami", value: "tsunami" },
  { label: "Volcano", value: "volcano" },
  { label: "Cyclone", value: "cyclone" },
] as const satisfies readonly SelectOption[];

export type HazardValue = (typeof hazardOptions)[number]["value"];

export const solutionTypeOptions = [
  { label: "WASH", value: "wash" },
  { label: "Health workforce", value: "health_workforce" },
  { label: "Energy", value: "energy" },
  { label: "Infrastructure", value: "infrastructure" },
  { label: "Products and technology", value: "products_technology" },
  { label: "Service delivery", value: "service_delivery" },
  { label: "Communities", value: "communities" },
] as const satisfies readonly SelectOption[];

export type SolutionTypeValue = (typeof solutionTypeOptions)[number]["value"];

export const costOptions = [
  { label: "$ Low", value: "low" },
  { label: "$$ Medium", value: "medium" },
  { label: "$$$ High", value: "high" },
  { label: "$-$$$ Variable", value: "variable" },
] as const satisfies readonly SelectOption[];

export type CostValue = (typeof costOptions)[number]["value"];

export const impactGroupOptions = [
  { label: "Biological", value: "biological" },
  { label: "Noncommunicable diseases", value: "noncommunicable" },
  { label: "Unintentional injuries", value: "unintentional_injuries" },
  { label: "Societal", value: "societal" },
] as const satisfies readonly SelectOption[];

export type ImpactGroupValue = (typeof impactGroupOptions)[number]["value"];

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const optionAliases: Record<string, string> = {
  flood: "flood",
  floods: "flood",
  "products technology": "products_technology",
  "products and technology": "products_technology",
  "products technical": "products_technology",
  technical: "products_technology",
  technology: "products_technology",
  "water sanitation and hygiene": "wash",
};

export function normalizeOptionValue<Option extends SelectOption>(
  value: string | undefined,
  options: readonly Option[],
): Option["value"] | undefined {
  if (!value) {
    return undefined;
  }

  const normalizedValue = normalizeLabel(value);
  const alias = optionAliases[normalizedValue];
  const aliasedOption = alias
    ? options.find((candidate) => candidate.value === alias)
    : undefined;

  if (aliasedOption) {
    return aliasedOption.value;
  }

  const option = options.find((candidate) => {
    return (
      candidate.value === value ||
      normalizeLabel(candidate.label) === normalizedValue ||
      normalizeLabel(candidate.value) === normalizedValue
    );
  });

  return option?.value;
}

export function normalizeOptionValues<Option extends SelectOption>(
  values: string[] | undefined,
  options: readonly Option[],
) {
  return (
    values
      ?.map((value) => normalizeOptionValue(value, options))
      .filter((value): value is Option["value"] => Boolean(value)) ?? []
  );
}

export function optionLabel(
  value: string | undefined,
  options: readonly SelectOption[],
) {
  if (!value) {
    return undefined;
  }

  return options.find((option) => option.value === value)?.label ?? value;
}
