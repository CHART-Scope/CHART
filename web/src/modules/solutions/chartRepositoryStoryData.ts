import type { SolutionRepositoryItem } from "../../lib/solutionRepositoryClient";

const storybookCardImage = new URL(
  "./assets/storybook-card-image.png",
  import.meta.url,
).toString();

const heatImage = storybookCardImage;
const floodImage = storybookCardImage;
const communityImage = storybookCardImage;

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
              filename: `${input.slug}.png`,
              mimeType: "image/png",
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
