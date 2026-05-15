export type ResourceItem = {
  title: string;
  description: string;
  tag: string;
};

export type ResourceSection = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  items: ResourceItem[];
};

export const resourceSections: ResourceSection[] = [
  {
    id: "climate-health-models",
    eyebrow: "Public resource",
    title: "Climate-health models",
    description: "Core model inputs for climate-health risk.",
    items: [
      {
        title: "Heat risk outlook",
        description: "Projected heat pressure by place.",
        tag: "Models"
      },
      {
        title: "Climate and health indicators",
        description: "Joined risk indicators.",
        tag: "Indicators"
      },
      {
        title: "Priority geographies",
        description: "Compare areas quickly.",
        tag: "Prioritization"
      }
    ]
  },
  {
    id: "vra-resources",
    eyebrow: "Public resource",
    title: "Vulnerability and resilience resources",
    description: "Frameworks for vulnerability and resilience review.",
    items: [
      {
        title: "Assessment framing",
        description: "Shared review structure.",
        tag: "VRA"
      },
      {
        title: "Resilience indicators",
        description: "Readiness and capacity signals.",
        tag: "Indicators"
      },
      {
        title: "Review prompts",
        description: "Prompts for local discussion.",
        tag: "Facilitation"
      }
    ]
  },
  {
    id: "solution-repository",
    eyebrow: "Public resource",
    title: "Solution repository",
    description: "Action options for planning and budget discussion.",
    items: [
      {
        title: "Preparedness actions",
        description: "Actions before peak heat.",
        tag: "Preparedness"
      },
      {
        title: "Response actions",
        description: "Actions during response.",
        tag: "Response"
      },
      {
        title: "Budget-ready actions",
        description: "Options with simple cost framing.",
        tag: "Budget"
      }
    ]
  }
];

export const governmentWorkspaceCapabilities = [
  "Shared geography workspace",
  "Priority area review",
  "Draft plan and funding case"
];
