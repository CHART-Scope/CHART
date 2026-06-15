import {
  indiaDistrictsByState,
  kenyaSubCountyConstituenciesByCounty,
  nigeriaLgasByState,
} from "./onboardingGeographyData";

export type MapBounds = {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
};

export type MapMarker = {
  label: string;
  lat: number;
  lon: number;
};

export type OnboardingGeographyLevel = "country" | "geo_level_1" | "geo_level_2";

export type JurisdictionLevel = {
  id: OnboardingGeographyLevel;
  label: string;
  pluralLabel: string;
  parentLevelId?: OnboardingGeographyLevel;
};

export type GeographyOption = {
  id: string;
  label: string;
  level: OnboardingGeographyLevel;
  levelLabel: string;
  parentId?: string;
  bounds?: MapBounds;
  marker?: MapMarker;
  sortOrder: number;
};

export type CountryOnboardingConfig = {
  bounds: MapBounds;
  defaultLevelId: OnboardingGeographyLevel;
  defaultParentId?: string;
  geographies: GeographyOption[];
  levels: JurisdictionLevel[];
  marker: MapMarker;
};

const indiaStateNames = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "National Capital Territory of Delhi",
  "Puducherry",
];

const kenyaCountyNames = [
  "Mombasa",
  "Kwale",
  "Kilifi",
  "Tana River",
  "Lamu",
  "Taita-Taveta",
  "Garissa",
  "Wajir",
  "Mandera",
  "Marsabit",
  "Isiolo",
  "Meru",
  "Tharaka-Nithi",
  "Embu",
  "Kitui",
  "Machakos",
  "Makueni",
  "Nyandarua",
  "Nyeri",
  "Kirinyaga",
  "Murang'a",
  "Kiambu",
  "Turkana",
  "West Pokot",
  "Samburu",
  "Trans-Nzoia",
  "Uasin Gishu",
  "Elgeyo-Marakwet",
  "Nandi",
  "Baringo",
  "Laikipia",
  "Nakuru",
  "Narok",
  "Kajiado",
  "Kericho",
  "Bomet",
  "Kakamega",
  "Vihiga",
  "Bungoma",
  "Busia",
  "Siaya",
  "Kisumu",
  "Homa Bay",
  "Migori",
  "Kisii",
  "Nyamira",
  "Nairobi",
];

const nigeriaStateNames = [
  "Abia",
  "Adamawa",
  "Akwa Ibom",
  "Anambra",
  "Bauchi",
  "Bayelsa",
  "Benue",
  "Borno",
  "Cross River",
  "Delta",
  "Ebonyi",
  "Edo",
  "Ekiti",
  "Enugu",
  "Gombe",
  "Imo",
  "Jigawa",
  "Kaduna",
  "Kano",
  "Katsina",
  "Kebbi",
  "Kogi",
  "Kwara",
  "Lagos",
  "Nasarawa",
  "Niger",
  "Ogun",
  "Ondo",
  "Osun",
  "Oyo",
  "Plateau",
  "Rivers",
  "Sokoto",
  "Taraba",
  "Yobe",
  "Zamfara",
  "Federal Capital Territory",
];

export const countryOnboardingConfigs: Record<string, CountryOnboardingConfig> = {
  IN: {
    bounds: { latMin: 6.7, latMax: 35.7, lonMin: 68.1, lonMax: 97.4 },
    marker: { label: "India", lat: 22.9, lon: 79 },
    defaultLevelId: "geo_level_2",
    defaultParentId: "in-madhya-pradesh",
    levels: [
      { id: "country", label: "National", pluralLabel: "National" },
      {
        id: "geo_level_1",
        label: "State / Union Territory",
        pluralLabel: "States / UTs",
      },
      {
        id: "geo_level_2",
        label: "District",
        pluralLabel: "Districts",
        parentLevelId: "geo_level_1",
      },
    ],
    geographies: [
      {
        id: "in",
        label: "India",
        level: "country",
        levelLabel: "Country",
        bounds: { latMin: 6.7, latMax: 35.7, lonMin: 68.1, lonMax: 97.4 },
        marker: { label: "India", lat: 22.9, lon: 79 },
        sortOrder: 0,
      },
      ...createGeographies({
        countryCode: "in",
        level: "geo_level_1",
        levelLabel: "State / Union Territory",
        names: indiaStateNames,
      }).map((geography) =>
        geography.id === "in-madhya-pradesh"
          ? {
              ...geography,
              bounds: { latMin: 21.0, latMax: 26.9, lonMin: 74.0, lonMax: 82.9 },
              marker: { label: "Madhya Pradesh", lat: 23.25, lon: 77.41 },
            }
          : geography,
      ),
      ...createGeographies({
        countryCode: "in",
        level: "geo_level_2",
        levelLabel: "District",
        namesByParent: indiaDistrictsByState,
      }).map((geography) =>
        geography.id === "in-madhya-pradesh-bhopal"
          ? {
              ...geography,
              bounds: { latMin: 22.95, latMax: 23.45, lonMin: 77.18, lonMax: 77.65 },
              marker: { label: "Bhopal", lat: 23.26, lon: 77.41 },
            }
          : geography,
      ),
    ],
  },
  KE: {
    bounds: { latMin: -4.8, latMax: 5.2, lonMin: 33.7, lonMax: 41.9 },
    marker: { label: "Kenya", lat: 0.1, lon: 37.9 },
    defaultLevelId: "geo_level_2",
    defaultParentId: "ke-kajiado",
    levels: [
      { id: "country", label: "National", pluralLabel: "National" },
      { id: "geo_level_1", label: "County", pluralLabel: "Counties" },
      {
        id: "geo_level_2",
        label: "Sub-county / constituency",
        pluralLabel: "Sub-counties / constituencies",
        parentLevelId: "geo_level_1",
      },
    ],
    geographies: [
      {
        id: "ke",
        label: "Kenya",
        level: "country",
        levelLabel: "Country",
        bounds: { latMin: -4.8, latMax: 5.2, lonMin: 33.7, lonMax: 41.9 },
        marker: { label: "Kenya", lat: 0.1, lon: 37.9 },
        sortOrder: 0,
      },
      ...createGeographies({
        countryCode: "ke",
        level: "geo_level_1",
        levelLabel: "County",
        names: kenyaCountyNames,
      }).map((geography) =>
        geography.id === "ke-kajiado"
          ? {
              ...geography,
              bounds: { latMin: -3.1, latMax: -0.7, lonMin: 35.9, lonMax: 37.9 },
              marker: { label: "Kajiado", lat: -1.85, lon: 36.79 },
            }
          : geography,
      ),
      ...createGeographies({
        countryCode: "ke",
        level: "geo_level_2",
        levelLabel: "Sub-county / constituency",
        namesByParent: kenyaSubCountyConstituenciesByCounty,
      }),
    ],
  },
  NG: {
    bounds: { latMin: 4.2, latMax: 13.9, lonMin: 2.6, lonMax: 14.7 },
    marker: { label: "Nigeria", lat: 9.1, lon: 8.7 },
    defaultLevelId: "geo_level_2",
    defaultParentId: "ng-lagos",
    levels: [
      { id: "country", label: "National", pluralLabel: "National" },
      { id: "geo_level_1", label: "State / FCT", pluralLabel: "States / FCT" },
      {
        id: "geo_level_2",
        label: "Local government area",
        pluralLabel: "Local government areas",
        parentLevelId: "geo_level_1",
      },
    ],
    geographies: [
      {
        id: "ng",
        label: "Nigeria",
        level: "country",
        levelLabel: "Country",
        bounds: { latMin: 4.2, latMax: 13.9, lonMin: 2.6, lonMax: 14.7 },
        marker: { label: "Nigeria", lat: 9.1, lon: 8.7 },
        sortOrder: 0,
      },
      ...createGeographies({
        countryCode: "ng",
        level: "geo_level_1",
        levelLabel: "State / FCT",
        names: nigeriaStateNames,
      }).map((geography) =>
        geography.id === "ng-lagos"
          ? {
              ...geography,
              bounds: { latMin: 6.35, latMax: 6.75, lonMin: 2.7, lonMax: 4.4 },
              marker: { label: "Lagos", lat: 6.52, lon: 3.38 },
            }
          : geography,
      ),
      ...createGeographies({
        countryCode: "ng",
        level: "geo_level_2",
        levelLabel: "Local government area",
        namesByParent: nigeriaLgasByState,
      }).map((geography) =>
        geography.id === "ng-lagos-lagos-mainland"
          ? {
              ...geography,
              bounds: { latMin: 6.47, latMax: 6.58, lonMin: 3.35, lonMax: 3.43 },
              marker: { label: "Lagos Mainland", lat: 6.5, lon: 3.38 },
            }
          : geography,
      ),
    ],
  },
};

function createGeographies(input: {
  countryCode: string;
  level: Exclude<OnboardingGeographyLevel, "country">;
  levelLabel: string;
  names?: string[];
  namesByParent?: Record<string, readonly string[]>;
  parentId?: string;
}) {
  if (input.namesByParent) {
    return Object.entries(input.namesByParent).flatMap(([parentName, names]) => {
      const parentId = `${input.countryCode}-${slugify(parentName)}`;

      return names.map(
        (name, index): GeographyOption => ({
          id: `${parentId}-${slugify(name)}`,
          label: name,
          level: input.level,
          levelLabel: input.levelLabel,
          parentId,
          sortOrder: (index + 1) * 10,
        }),
      );
    });
  }

  return (input.names ?? []).map(
    (name, index): GeographyOption => ({
      id: `${input.countryCode}-${slugify(name)}`,
      label: name,
      level: input.level,
      levelLabel: input.levelLabel,
      parentId: input.parentId,
      sortOrder: (index + 1) * 10,
    }),
  );
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
