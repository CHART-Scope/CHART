import type { SolutionRepositoryItem } from "../../lib/solutionRepositoryClient";
import type {
  HazardRepositoryItem,
  HealthOutcomeRepositoryItem,
} from "./SolutionRepositoryComponents";

const heatImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23fff0d8'/%3E%3Ccircle cx='905' cy='165' r='96' fill='%23f59e0b'/%3E%3Cpath d='M0 610c136-58 254-74 360-43 127 37 202 122 357 85 136-33 224-128 363-86 58 17 96 44 120 69v165H0z' fill='%23dc7633'/%3E%3Cpath d='M0 704c170-42 322-37 456 13 145 54 265 55 430 5 126-38 225-35 314 11v67H0z' fill='%238c4a2f'/%3E%3C/svg%3E";
const floodImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23dff7fb'/%3E%3Cpath d='M0 565c105-28 187-22 270 16 102 47 196 53 314 4 133-55 236-55 364 5 89 42 171 48 252 18v192H0z' fill='%230e7490'/%3E%3Cpath d='M0 688c119-40 219-36 325 8 121 50 227 48 348-5 150-66 278-44 527 19v90H0z' fill='%230f5068'/%3E%3C/svg%3E";
const communityImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800'%3E%3Crect width='1200' height='800' fill='%23e9f7ef'/%3E%3Cpath d='M130 520h760V240L510 95 130 240z' fill='%232f8f62'/%3E%3Cpath d='M242 520h586V300H242z' fill='%23ffffff'/%3E%3Cpath d='M332 520V374h142v146zm230 0V374h142v146z' fill='%23bde7d0'/%3E%3Cpath d='M0 646c160-72 309-80 446-24 130 53 250 66 406 8 90-34 168-37 348-7v177H0z' fill='%231f6f54'/%3E%3C/svg%3E";

export const mentalHealthScreening = createSolution({
  slug: "mental-health-screening-form",
  name: "Mental health screening form",
  summary:
    "Equip community health workers with standard tools for household mental health screening, referral, and follow-up.",
  description:
    "Community health services can prioritize mental health support by training CHWs to conduct screenings during household visits, integrating mental health services at primary care facilities, and tracking follow-up support for people who receive assistance.",
  hazards: ["Floods", "Drought", "Storm", "Extreme heat", "Wildfire"],
  solutionTypes: ["Service delivery"],
  cost: "medium",
  links: [
    "https://www.refugeehealthta.org/wp-content/uploads/2012/09/RHS15_Packet_PathwaysToWellness-1.pdf",
  ],
  caseStudy: "Household-level mental health screening form.pdf",
  imageUrl: communityImage,
});

export const floatingClinic = createSolution({
  slug: "floating-clinic",
  name: "Floating clinic",
  summary:
    "Use boats or temporary platforms to maintain medical access in flood-affected areas.",
  description:
    "Equip and maintain boats or makeshift platforms for mobile healthcare in flood-affected regions. The approach can use existing resources for immediate relief to cut-off communities.",
  hazards: ["Floods", "Sea level rise", "Storm"],
  solutionTypes: ["Service delivery"],
  cost: "high",
  links: ["https://www.shidhulai.org/our-work.html"],
  imageUrl: floodImage,
});

export const rapidCoolingBodyBags = createSolution({
  slug: "use-of-rapid-cooling-body-bags",
  name: "Use of rapid cooling body bags",
  summary:
    "Treat heat stroke with portable body bags filled with water and ice where clinical cooling equipment is limited.",
  description:
    "Rapid cooling body bags are portable, waterproof, simple to prepare, and cost-effective. They keep chilled water and ice close to the patient's skin while leaving access for monitoring and medical equipment.",
  hazards: ["Extreme heat", "Increased temperature"],
  solutionTypes: ["Service delivery"],
  cost: "low",
  links: ["https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7493529/"],
  imageUrl: heatImage,
});

export const vectorborneWarnings = createSolution({
  slug: "warnings-on-increased-risk-of-vectorborne-diseases",
  name: "Warnings on increased risk of vectorborne diseases",
  summary:
    "Use SMS, community events, and CHW visits to communicate prevention steps during elevated vectorborne disease risk.",
  description:
    "District and health systems can send SMS alerts and increase CHW outreach to share prevention measures for vector and waterborne diseases in flood-prone areas.",
  hazards: ["Floods", "Storm"],
  solutionTypes: ["Service delivery"],
  cost: "low",
  links: [],
  caseStudy: "Prevention of vectorborne diseases.pdf",
  imageUrl: floodImage,
});

export const floodBarriers = createSolution({
  slug: "flood-gates-flood-barriers",
  name: "Flood gates/ Flood barriers",
  summary:
    "Place temporary flood barriers at clinic doors to reduce flood damage and keep facilities operational.",
  description:
    "Flood door barriers provide a temporary but effective defense for clinics when flooding threatens. They require little maintenance and can be stored away when not in use.",
  hazards: ["Floods", "Storm", "Sea level rise"],
  solutionTypes: ["Infrastructure"],
  cost: "low",
  links: [
    "https://disastercompany.com/everything-you-need-to-know-about-flood-barriers/",
  ],
  imageUrl: floodImage,
});

export const naturalVentilation = createSolution({
  slug: "natural-ventilation",
  name: "Natural ventilation",
  summary:
    "Retrofit facilities for cross-ventilation so spaces can stay cooler with less energy demand.",
  description:
    "Cross-ventilation renews air throughout a facility. Ventilation bricks, openings, and inner courtyards let cool air in and allow hot air to rise out of the building.",
  hazards: ["Extreme heat", "Increased temperature"],
  solutionTypes: ["Infrastructure"],
  cost: "high",
  links: [],
  caseStudy: "Natural ventilation.pdf",
  imageUrl: heatImage,
});

export const chartRepositorySolutions = [
  mentalHealthScreening,
  floatingClinic,
  rapidCoolingBodyBags,
  vectorborneWarnings,
  floodBarriers,
  naturalVentilation,
];

export const heatIllnessOutcome: HealthOutcomeRepositoryItem = {
  id: "health-outcome-heat-illness",
  name: "Heat illness and heat stroke",
  summary:
    "Heat exposure can increase dehydration, heat exhaustion, heat stroke, and facility surge pressure.",
  description:
    "This outcome helps teams connect heat hazards to clinical readiness, cooling access, worker outreach, and facility ventilation solutions.",
  affectedGroups: ["Outdoor workers", "Older adults", "Pregnant people"],
  indicators: [
    { label: "Heat-related visits", value: "+18% season to date" },
    { label: "Nighttime temperature", value: "Above seasonal range" },
    { label: "Cooling access", value: "Limited in dense settlements" },
  ],
  relatedHazards: ["Extreme heat", "Increased temperature"],
  solutions: [rapidCoolingBodyBags, naturalVentilation],
  imageUrl: heatImage,
};

export const vectorborneOutcome: HealthOutcomeRepositoryItem = {
  id: "health-outcome-vectorborne-disease",
  name: "Vectorborne and waterborne disease",
  summary:
    "Flooding and storms can increase standing water, contamination, and disease prevention needs.",
  description:
    "This outcome connects flood-prone conditions to warning, outreach, water safety, and mobile service continuity solutions.",
  affectedGroups: ["Children under five", "Flood-prone settlements", "Remote clinics"],
  indicators: [
    { label: "Water quality alerts", value: "Elevated after storms" },
    { label: "Vector habitat", value: "Expanding in low-lying wards" },
    { label: "Clinic access", value: "12 sites at seasonal access risk" },
  ],
  relatedHazards: ["Floods", "Storm", "Sea level rise"],
  solutions: [vectorborneWarnings, floatingClinic, floodBarriers],
  imageUrl: floodImage,
};

export const mentalHealthOutcome: HealthOutcomeRepositoryItem = {
  id: "health-outcome-mental-health",
  name: "Mental health and psychosocial support",
  summary:
    "Climate shocks can increase stress, displacement pressure, and follow-up needs for vulnerable households.",
  description:
    "This outcome links climate hazards to community-based screening, referral, and follow-up workflows that can be delivered through health workers and primary care facilities.",
  affectedGroups: ["Displaced households", "Caregivers", "Frontline workers"],
  indicators: [
    { label: "Screening coverage", value: "Needs baseline" },
    { label: "Referral completion", value: "Track monthly" },
    { label: "Follow-up status", value: "Open CHW task list" },
  ],
  relatedHazards: ["Floods", "Drought", "Storm", "Extreme heat"],
  solutions: [mentalHealthScreening],
  imageUrl: communityImage,
};

export const chartRepositoryHealthOutcomes = [
  heatIllnessOutcome,
  vectorborneOutcome,
  mentalHealthOutcome,
];

export const chartRepositoryHazards: HazardRepositoryItem[] = [
  {
    id: "hazard-extreme-heat",
    name: "Extreme heat",
    summary:
      "Sustained high temperatures increase heat stress, dehydration, and pressure on outpatient services.",
    description:
      "Extreme heat affects outdoor workers, older adults, pregnant people, and people living in dense housing first. Planning teams can connect this hazard to cooling, clinical readiness, and facility ventilation actions.",
    severity: "High",
    trend: "Increasing",
    regionsAtRisk: ["Western Province", "Central Province"],
    priorityGroups: ["Older adults", "Outdoor workers", "Pregnant people"],
    healthOutcomes: [heatIllnessOutcome, mentalHealthOutcome],
    solutions: [rapidCoolingBodyBags, naturalVentilation, mentalHealthScreening],
    imageUrl: heatImage,
  },
  {
    id: "hazard-floods",
    name: "Floods",
    summary:
      "Seasonal flooding disrupts access to clinics, damages infrastructure, and increases waterborne disease risk.",
    description:
      "Flooding creates immediate response needs and longer service continuity risks. Repository teams can compare facility protection, outreach, warning, and mobile service actions.",
    severity: "Severe",
    trend: "More variable",
    regionsAtRisk: ["Coastal Province", "River basin districts"],
    priorityGroups: ["Children under five", "Remote clinics", "Informal settlements"],
    healthOutcomes: [vectorborneOutcome, mentalHealthOutcome],
    solutions: [floatingClinic, vectorborneWarnings, floodBarriers],
    imageUrl: floodImage,
  },
  {
    id: "hazard-drought",
    name: "Drought",
    summary:
      "Long dry periods increase household stress, water pressure, and health service follow-up needs.",
    description:
      "Drought planning links health services with water, agriculture, social protection, and community health worker networks.",
    severity: "Elevated",
    trend: "Emerging",
    regionsAtRisk: ["Northern districts", "Agricultural corridors"],
    priorityGroups: ["Smallholder households", "Rural clinics", "Children under five"],
    healthOutcomes: [mentalHealthOutcome],
    solutions: [mentalHealthScreening],
    imageUrl: null,
  },
];

function createSolution(input: {
  slug: string;
  name: string;
  summary: string;
  description: string;
  hazards: string[];
  solutionTypes: string[];
  cost: "low" | "medium" | "high";
  links: string[];
  caseStudy?: string;
  imageUrl?: string | null;
}): SolutionRepositoryItem {
  return {
    id: `solution-${input.slug}`,
    slug: input.slug,
    name: input.name,
    summary: input.summary,
    description: input.description,
    implementationNotes: null,
    costOfImplementation: input.cost,
    maintenanceRequirement: null,
    timeToImplement: null,
    evidenceLevel: null,
    sourceId: "chart-solution-repository",
    sourceRecordId: input.slug,
    sourceVersion: "1",
    sourceUpdatedAt: null,
    license: null,
    attribution: "CHART seed repository",
    status: "published",
    taxonomies: [
      ...input.hazards.map((label) => ({
        id: `hazard-${slugify(label)}`,
        type: "hazard",
        label,
      })),
      ...input.solutionTypes.map((label) => ({
        id: `solution-type-${slugify(label)}`,
        type: "solution_type",
        label,
      })),
    ],
    links: input.links.map((url) => ({ label: hostLabel(url), url })),
    assets: [
      ...(input.imageUrl
        ? [
            {
              id: `solution-asset-${input.slug}-image`,
              kind: "image",
              filename: `${input.slug}.svg`,
              mimeType: "image/svg+xml",
              sizeBytes: null,
              storageUrl: input.imageUrl,
              attribution: "CHART story asset",
            },
          ]
        : []),
      ...(input.caseStudy
        ? [
            {
              id: `solution-asset-${input.slug}-case-study`,
              kind: "case_study",
              filename: input.caseStudy,
              mimeType: "application/pdf",
              sizeBytes: null,
              storageUrl: "#",
              attribution: "CHART seed repository",
            },
          ]
        : []),
    ],
  };
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
