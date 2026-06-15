export type LandingResourceId = "models" | "vra" | "solutions";

export type LandingToolkitPreview = "risk" | "vra" | "solutions";

export type LandingResourceSection = {
  id: LandingResourceId;
  href: string;
  title: string;
  description: string;
  ctaLabel: string;
  preview: LandingToolkitPreview;
  detail: {
    eyebrow: string;
    lead: string;
    highlights: Array<{
      title: string;
      description: string;
    }>;
    nextHref: string;
    nextLabel: string;
  };
};

export const landingNavLinks = [
  { href: "/#models", label: "Climate and health risks" },
  { href: "/#vra", label: "Vulnerability assessments" },
  { href: "/#solutions", label: "Solution repository" },
];

export const landingResourceSections: LandingResourceSection[] = [
  {
    id: "models",
    href: "#models",
    title: "Climate and health risks",
    description:
      "Explore contextual climate and health risk predictions for your local area.",
    ctaLabel: "Explore climate and health risks",
    preview: "risk",
    detail: {
      eyebrow: "Climate and health risks",
      lead: "Use climate and health signals to identify the hazards that need attention first in a local planning cycle.",
      highlights: [
        {
          title: "Compare hazards",
          description:
            "Review heat, flooding, rainfall, air quality, and other risk signals in a common planning view.",
        },
        {
          title: "Connect risk to health",
          description:
            "Translate climate hazards into likely pressure on people, facilities, services, and health outcomes.",
        },
        {
          title: "Prioritize first action",
          description:
            "Use risk scoring to support a focused planning conversation when resources are limited.",
        },
      ],
      nextHref: "/#vra",
      nextLabel: "Continue to vulnerability",
    },
  },
  {
    id: "vra",
    href: "#vra",
    title: "Vulnerability assessments",
    description:
      "Access guidance and tools for exposure and vulnerability assessments across health system areas.",
    ctaLabel: "Explore vulnerability assessments",
    preview: "vra",
    detail: {
      eyebrow: "Vulnerability assessments",
      lead: "Move from hazard signals to a practical view of who may be most affected and which services may need reinforcement.",
      highlights: [
        {
          title: "Assess local exposure",
          description:
            "Bring population, facility, and service context into the same workflow as climate risk.",
        },
        {
          title: "Review service readiness",
          description:
            "Capture where facilities, programs, or response systems may be more exposed to shocks.",
        },
        {
          title: "Prepare action criteria",
          description:
            "Create a clear basis for selecting solutions and explaining why they matter locally.",
        },
      ],
      nextHref: "/solutions",
      nextLabel: "Continue to solutions",
    },
  },
  {
    id: "solutions",
    href: "/solutions",
    title: "Solution repository",
    description:
      "Browse through a repository of climate-resilient health adaptation interventions.",
    ctaLabel: "Explore solution repository",
    preview: "solutions",
    detail: {
      eyebrow: "Solution repository",
      lead: "Use reviewed interventions and implementation notes to turn evidence into planning and budget-ready choices.",
      highlights: [
        {
          title: "Browse adaptation interventions",
          description:
            "Compare policy, infrastructure, service delivery, surveillance, and community-level interventions.",
        },
        {
          title: "Review implementation evidence",
          description:
            "Keep evidence summaries and practical notes maintainable outside a single deployment.",
        },
        {
          title: "Support budget conversations",
          description:
            "Use solution detail as a starting point for cost, owner, and implementation planning.",
        },
      ],
      nextHref: "/#contact",
      nextLabel: "Talk to the CHART team",
    },
  },
];

export function getLandingResourceSection(resourceId: LandingResourceId) {
  return (
    landingResourceSections.find((section) => section.id === resourceId) ??
    landingResourceSections[0]
  );
}
