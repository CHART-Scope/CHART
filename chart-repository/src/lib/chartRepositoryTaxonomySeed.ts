export type HazardSeedItem = {
  externalId: string;
  slug: string;
  label: string;
  hazardGroup: string;
  sortOrder: number;
};

export type HealthImplicationSeedItem = {
  externalId: string;
  label: string;
  impactGroup: string;
  examples: string;
  sortOrder: number;
  hazardExternalIds: string[];
};

export const hazardSeed = [
  {
    externalId: "hazard-storm",
    slug: "storm",
    label: "Storm",
    hazardGroup: "meteorological",
    sortOrder: 10,
  },
  {
    externalId: "hazard-extreme-heat",
    slug: "extreme_heat",
    label: "Extreme heat",
    hazardGroup: "meteorological",
    sortOrder: 20,
  },
  {
    externalId: "hazard-increased-temperature",
    slug: "increased_temperature",
    label: "Increased temperature",
    hazardGroup: "environmental_change",
    sortOrder: 30,
  },
  {
    externalId: "hazard-earthquake",
    slug: "earthquake",
    label: "Earthquake",
    hazardGroup: "geophysical",
    sortOrder: 40,
  },
  {
    externalId: "hazard-flood",
    slug: "flood",
    label: "Flood",
    hazardGroup: "hydrological",
    sortOrder: 50,
  },
  {
    externalId: "hazard-sea-level-rise",
    slug: "sea_level_rise",
    label: "Sea level rise",
    hazardGroup: "environmental_change",
    sortOrder: 60,
  },
  {
    externalId: "hazard-cold-wave",
    slug: "cold_wave",
    label: "Cold wave",
    hazardGroup: "meteorological",
    sortOrder: 70,
  },
  {
    externalId: "hazard-drought",
    slug: "drought",
    label: "Drought",
    hazardGroup: "climatological",
    sortOrder: 80,
  },
  {
    externalId: "hazard-wildfire",
    slug: "wildfire",
    label: "Wildfire",
    hazardGroup: "climatological",
    sortOrder: 90,
  },
  {
    externalId: "hazard-increased-co2-levels",
    slug: "increased_co2_levels",
    label: "Increased CO2 levels",
    hazardGroup: "environmental_change",
    sortOrder: 100,
  },
  {
    externalId: "hazard-landslide",
    slug: "landslide",
    label: "Landslide",
    hazardGroup: "geophysical",
    sortOrder: 110,
  },
  {
    externalId: "hazard-tsunami",
    slug: "tsunami",
    label: "Tsunami",
    hazardGroup: "geophysical",
    sortOrder: 120,
  },
  {
    externalId: "hazard-volcano",
    slug: "volcano",
    label: "Volcano",
    hazardGroup: "geophysical",
    sortOrder: 130,
  },
  {
    externalId: "hazard-cyclone",
    slug: "cyclone",
    label: "Cyclone",
    hazardGroup: "geophysical",
    sortOrder: 140,
  },
] as const satisfies readonly HazardSeedItem[];

export const healthImplicationSeed = [
  {
    externalId: "health-waterborne",
    label: "Waterborne diseases",
    impactGroup: "biological",
    examples: "Diarrhoeal diseases, Cholera, Typhoid fever",
    sortOrder: 10,
    hazardExternalIds: [
      "hazard-increased-temperature",
      "hazard-flood",
      "hazard-extreme-heat",
    ],
  },
  {
    externalId: "health-foodborne",
    label: "Foodborne diseases",
    impactGroup: "biological",
    examples: "Hepatitis A, Foodborne microbial hazards",
    sortOrder: 20,
    hazardExternalIds: [
      "hazard-increased-temperature",
      "hazard-flood",
      "hazard-extreme-heat",
    ],
  },
  {
    externalId: "health-vectorborne",
    label: "Vectorborne diseases",
    impactGroup: "biological",
    examples:
      "Dengue, Malaria, Chikungunya, Zika, Rift Valley fever, West Nile virus, Lyme disease",
    sortOrder: 30,
    hazardExternalIds: [
      "hazard-increased-temperature",
      "hazard-storm",
      "hazard-flood",
      "hazard-sea-level-rise",
      "hazard-drought",
    ],
  },
  {
    externalId: "health-airborne",
    label: "Airborne diseases",
    impactGroup: "biological",
    examples: "Respiratory infections, Meningococcal meningitis, Influenza",
    sortOrder: 40,
    hazardExternalIds: ["hazard-increased-temperature"],
  },
  {
    externalId: "health-cardiovascular",
    label: "Cardiovascular diseases",
    impactGroup: "noncommunicable",
    examples: "Stroke, Diabetes, Heart attack",
    sortOrder: 50,
    hazardExternalIds: [
      "hazard-increased-temperature",
      "hazard-storm",
      "hazard-extreme-heat",
      "hazard-sea-level-rise",
      "hazard-drought",
      "hazard-wildfire",
    ],
  },
  {
    externalId: "health-chronic-respiratory",
    label: "Chronic respiratory diseases",
    impactGroup: "noncommunicable",
    examples:
      "Asthma, Chronic obstructive pulmonary disease (COPD), Respiratory allergies",
    sortOrder: 60,
    hazardExternalIds: [
      "hazard-storm",
      "hazard-flood",
      "hazard-extreme-heat",
      "hazard-sea-level-rise",
      "hazard-drought",
      "hazard-wildfire",
    ],
  },
  {
    externalId: "health-deaths",
    label: "Deaths",
    impactGroup: "unintentional_injuries",
    examples: "Drowning, Electrical shock",
    sortOrder: 70,
    hazardExternalIds: [
      "hazard-storm",
      "hazard-flood",
      "hazard-extreme-heat",
      "hazard-cold-wave",
      "hazard-sea-level-rise",
      "hazard-wildfire",
      "hazard-landslide",
      "hazard-earthquake",
      "hazard-tsunami",
      "hazard-volcano",
      "hazard-cyclone",
    ],
  },
  {
    externalId: "health-injuries",
    label: "Injuries",
    impactGroup: "unintentional_injuries",
    examples: "Physical traumas, Animal bites, Burns",
    sortOrder: 80,
    hazardExternalIds: [
      "hazard-storm",
      "hazard-flood",
      "hazard-wildfire",
      "hazard-landslide",
      "hazard-earthquake",
      "hazard-tsunami",
      "hazard-volcano",
      "hazard-cyclone",
    ],
  },
  {
    externalId: "health-heat-related-illness",
    label: "Heat-related illness",
    impactGroup: "unintentional_injuries",
    examples:
      "Heat stress, Heat exhaustion, Heat syncope, Heat oedema, Heat rash, Dehydration-induced heat cramps",
    sortOrder: 90,
    hazardExternalIds: ["hazard-extreme-heat"],
  },
  {
    externalId: "health-extreme-cold",
    label: "Exposure to extreme cold",
    impactGroup: "unintentional_injuries",
    examples: "Hypothermia leading to cardiac workload, Frostbite",
    sortOrder: 100,
    hazardExternalIds: ["hazard-cold-wave"],
  },
  {
    externalId: "health-mental-health",
    label: "Mental health effects",
    impactGroup: "unintentional_injuries",
    examples: "Acute traumatic stress, Anxiety and depression, Insomnia",
    sortOrder: 110,
    hazardExternalIds: [
      "hazard-storm",
      "hazard-flood",
      "hazard-sea-level-rise",
      "hazard-drought",
      "hazard-wildfire",
      "hazard-landslide",
      "hazard-earthquake",
      "hazard-tsunami",
      "hazard-volcano",
      "hazard-cyclone",
    ],
  },
  {
    externalId: "health-displaced-populations",
    label: "Displaced populations",
    impactGroup: "societal",
    examples:
      "Water and food scarcity, Mental health problems, Protein-energy malnutrition, Conflict and violence",
    sortOrder: 120,
    hazardExternalIds: [
      "hazard-flood",
      "hazard-landslide",
      "hazard-earthquake",
      "hazard-tsunami",
      "hazard-volcano",
      "hazard-cyclone",
    ],
  },
  {
    externalId: "health-famine",
    label: "Famine",
    impactGroup: "societal",
    examples: "Water and food scarcity, Protein-energy malnutrition",
    sortOrder: 130,
    hazardExternalIds: [
      "hazard-increased-temperature",
      "hazard-landslide",
      "hazard-earthquake",
      "hazard-tsunami",
      "hazard-volcano",
      "hazard-cyclone",
    ],
  },
] as const satisfies readonly HealthImplicationSeedItem[];
