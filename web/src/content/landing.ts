export type LandingResourceSection = {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  preview: "risk" | "vra" | "solutions";
};

export type LandingGovernmentQuestion = {
  question: string;
  answer: string;
};

export type LandingWorkflowStep = {
  step: string;
  title: string;
  description: string;
};

export type LandingPriorityExample = {
  hazard: string;
  signal: string;
  impact: string;
  score: number;
  isPriority?: boolean;
};

export const landingNavLinks = [
  { href: "#overview", label: "What CHART does" },
  { href: "#workflow", label: "Planning workflow" },
  { href: "#solutions", label: "Solutions" },
];

export const landingPriorityStatement =
  "If I have limited resources, CHART helps me see which climate hazard to prioritize first and where action will have the biggest impact.";

export const landingPriorityExamples: LandingPriorityExample[] = [
  {
    hazard: "Extreme heat",
    signal: "Very high risk",
    impact: "Largest preventable health impact",
    score: 91,
    isPriority: true,
  },
  {
    hazard: "Air pollution",
    signal: "High risk",
    impact: "Important but less urgent here",
    score: 74,
  },
  {
    hazard: "Flooding",
    signal: "Medium risk",
    impact: "Targeted action needed",
    score: 62,
  },
];

export const landingGovernmentQuestions: LandingGovernmentQuestion[] = [
  {
    question: "What is CHART?",
    answer:
      "A planning tool that connects climate hazards, health risks, local vulnerability, and practical adaptation actions in one place.",
  },
  {
    question: "Who is it for?",
    answer:
      "State, county, district, and health-sector officials who need to coordinate climate and health planning across teams.",
  },
  {
    question: "Why does it matter?",
    answer:
      "It helps teams see where risk is highest, who may be most affected, and what actions can be prioritized with evidence.",
  },
];

export const landingWorkflowSteps: LandingWorkflowStep[] = [
  {
    step: "1",
    title: "Understand hazards",
    description:
      "Start with climate signals such as extreme heat, flooding, or changing rainfall in your area.",
  },
  {
    step: "2",
    title: "See health risk",
    description:
      "Translate hazards into likely health impacts for people, services, and facilities.",
  },
  {
    step: "3",
    title: "Review gaps",
    description:
      "Check which populations, facilities, or services may be more exposed or less prepared.",
  },
  {
    step: "4",
    title: "Find solutions",
    description:
      "Compare practical actions and supporting resources for planning and budget discussions.",
  },
];

export const landingResourceSections: LandingResourceSection[] = [
  {
    id: "models",
    title: "Understand local hazards and health risks",
    description:
      "Start with plain-language climate signals, such as extreme heat or floods, and see what they could mean for health services and communities in your area.",
    ctaLabel: "Start with risks",
    preview: "risk",
  },
  {
    id: "vra",
    title: "Review who and what may need support",
    description:
      "Review where people, facilities, and services may need more support. Vulnerability assessment simply means checking who is more exposed and less able to cope.",
    ctaLabel: "Review vulnerability",
    preview: "vra",
  },
  {
    id: "solutions",
    title: "Move from evidence to action",
    description:
      "Compare practical adaptation actions, example resources, and implementation notes that can support planning and budget discussions.",
    ctaLabel: "Find solutions",
    preview: "solutions",
  },
];
