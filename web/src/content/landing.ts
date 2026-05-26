export type LandingResourceItem = {
  title: string;
  description: string;
  tag: string;
  meta: string;
};

export type LandingResourceSection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  items: LandingResourceItem[];
};

export type LicenseLayer = {
  name: string;
  license: string;
  description: string;
  accentClass: "code" | "schema" | "content" | "data";
};

export type DatasetSource = {
  name: string;
  use: string;
  redistribution: string;
  linkLabel: string;
};

export const landingNavLinks = [
  { href: "#models", label: "Models" },
  { href: "#vra", label: "VRA resources" },
  { href: "#solutions", label: "Solution repository" },
  { href: "#license", label: "License & data" },
];

export const landingSummarySteps = [
  {
    number: "01",
    title: "Open evidence",
    text: "Public methods, models and implementation references stay accessible without login.",
  },
  {
    number: "02",
    title: "Shared planning",
    text: "Government teams move into a scoped workspace when they need district-level planning and coordination.",
  },
  {
    number: "03",
    title: "Funding-ready action",
    text: "The private workspace turns evidence into priority areas, actions and a justification case.",
  },
];

export const landingResourceSections: LandingResourceSection[] = [
  {
    id: "models",
    eyebrow: "Climate-health models",
    title: "Open methodologies that connect climate signals to health outcomes",
    description:
      "Heat, flood, vector-borne and MNCH model references with clear source context and reuse expectations.",
    items: [
      {
        title: "Heat-MNCH risk index",
        description:
          "A reference method for combining temperature projections, exposure and maternal-child health indicators.",
        tag: "Model",
        meta: "Source-aware",
      },
      {
        title: "Air-quality exposure signals",
        description:
          "Air-quality model references that show how pollution burdens can be layered into climate-health planning.",
        tag: "Exposure",
        meta: "Reusable",
      },
      {
        title: "Priority geography framing",
        description:
          "A simple way to compare vulnerability, exposure and population scale before making planning choices.",
        tag: "Prioritization",
        meta: "Planning-ready",
      },
    ],
  },
  {
    id: "vra",
    eyebrow: "VRA resources",
    title: "Vulnerability and resilience resources built for facilitation",
    description:
      "Shared structures for stakeholder mapping, indicator selection, assessment prompts and composite-risk review.",
    items: [
      {
        title: "Scoping and stakeholder map",
        description:
          "A facilitation starting point for hazards, populations, institutions and local decision-makers.",
        tag: "VRA",
        meta: "Step 1",
      },
      {
        title: "Hazard and exposure profile",
        description:
          "Guidance on how to combine climate model outputs, geography and population indicators.",
        tag: "Assessment",
        meta: "Step 2",
      },
      {
        title: "Composite risk agreement",
        description:
          "A structured way for cross-sector teams to agree on focus zones before they move into planning.",
        tag: "Consensus",
        meta: "Step 5",
      },
    ],
  },
  {
    id: "solutions",
    eyebrow: "Solution repository",
    title: "Action options that can move directly into planning and budget discussion",
    description:
      "Preparedness, response and systems-strengthening ideas curated to be easy to scan, compare and reuse.",
    items: [
      {
        title: "HeatCare Kit",
        description:
          "Household-level protection packs for at-risk groups distributed through community health networks.",
        tag: "Household",
        meta: "Low-cost",
      },
      {
        title: "Cool-roof retrofit guide",
        description:
          "Facility-level guidance for reducing internal temperatures in PHCs and other frontline settings.",
        tag: "Infrastructure",
        meta: "Facility",
      },
      {
        title: "Climate Ready training pack",
        description:
          "Training modules for ASHAs, ANMs and PHC teams working through climate-related health pressure.",
        tag: "Training",
        meta: "Workforce",
      },
    ],
  },
];

export const licenseLayers: LicenseLayer[] = [
  {
    name: "Code",
    license: "AGPL v3",
    description:
      "Application code for the CHART platform, including the UI and backend implementation.",
    accentClass: "code",
  },
  {
    name: "Configs and schemas",
    license: "Apache 2.0",
    description:
      "Shared configuration, exchange formats and structured planning schemas intended for broad reuse.",
    accentClass: "schema",
  },
  {
    name: "Docs and content",
    license: "CC BY 4.0",
    description:
      "Narrative content, public guidance and authored resource descriptions on the CHART site.",
    accentClass: "content",
  },
  {
    name: "External data",
    license: "Provider terms apply",
    description:
      "Third-party climate, health and geography data displayed in CHART but not relicensed by CHART.",
    accentClass: "data",
  },
];

export const datasetSources: DatasetSource[] = [
  {
    name: "ERA5 and CMIP6 climate products",
    use: "Climate baselines and scenario signals",
    redistribution: "Check provider terms",
    linkLabel: "Copernicus climate data",
  },
  {
    name: "MoHFW and partner health summaries",
    use: "Aggregated health indicators",
    redistribution: "Summary views only",
    linkLabel: "Health programme sources",
  },
  {
    name: "Census and demographic layers",
    use: "Population, household and age-group framing",
    redistribution: "Microdata restricted",
    linkLabel: "Population references",
  },
  {
    name: "OpenStreetMap basemap",
    use: "Reference geography and navigation context",
    redistribution: "Open with attribution",
    linkLabel: "OpenStreetMap",
  },
];
