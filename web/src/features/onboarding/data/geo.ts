export type SetupPlaceOption = {
  placeCode: string;
  id: string;
  name: string;
  level: string;
  levelLabel: string;
  parentPlaceCode: string | null;
  path: string;
  sortOrder: number;
  predictionSupported: boolean;
  modelMappings?: {
    releaseId: string;
    outcome: string;
    outcomeLabel: string;
    modelAreaName: string;
    modelScopeLabel: string;
  }[];
};

export type SetupLevelOption = {
  key: string;
  label: string;
  sortOrder: number;
};

export type SetupCountryOption = {
  countryCode: string;
  countryName: string;
  rootId: string;
  rootPath: string;
  levels: SetupLevelOption[];
  places: SetupPlaceOption[];
};

export type LevelConfig = {
  options: string[];
  primaryLabel: string;
  secondaryLabel?: string;
  /** Child choices keyed by the selected parent display name. */
  sub?: Record<string, string[]>;
};

export type CountryGeo = Record<string, LevelConfig>;

/** Build onboarding choices only from backend model-release geography records. */
export function buildGeoData(
  catalog: SetupCountryOption[],
): Record<string, CountryGeo> {
  return Object.fromEntries(
    catalog.map((country) => {
      const byCode = new Map(
        country.places.map((place) => [place.placeCode, place]),
      );
      const levels: CountryGeo = {};
      for (const level of [...country.levels].sort(
        (left, right) => left.sortOrder - right.sortOrder,
      )) {
        const places = country.places
          .filter(
            (place) => place.level === level.key && place.predictionSupported,
          )
          .sort((left, right) => left.sortOrder - right.sortOrder);
        if (places.length === 0) continue;
        const hasParents = places.some((place) => place.parentPlaceCode !== null);
        if (!hasParents) {
          levels[level.label] = {
            options: places.map((place) => place.name),
            primaryLabel: level.label,
          };
          continue;
        }
        const sub: Record<string, string[]> = {};
        for (const place of places) {
          const parent = place.parentPlaceCode
            ? byCode.get(place.parentPlaceCode)
            : undefined;
          if (!parent) continue;
          (sub[parent.name] ??= []).push(place.name);
        }
        const parentLevelKey = places
          .map((place) =>
            place.parentPlaceCode ? byCode.get(place.parentPlaceCode)?.level : undefined,
          )
          .find(Boolean);
        levels[level.label] = {
          options: Object.keys(sub),
          primaryLabel:
            country.levels.find((item) => item.key === parentLevelKey)?.label ??
            "Parent area",
          secondaryLabel: level.label,
          sub,
        };
      }
      return [country.countryName, levels];
    }),
  );
}

export function geoLabelForLevel(config: LevelConfig): string {
  return config.primaryLabel;
}

export function subGeoLabelForLevel(config: LevelConfig): string {
  return config.secondaryLabel ?? "Sub-area";
}
