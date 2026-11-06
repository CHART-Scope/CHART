/**
 * What GET /actions returns for an Indian place in these browser tests, in the
 * public feed's shape (docs/actions.md). Before the heat season: counselling
 * and equipment; during it: counselling, worker protocols and cool shelters.
 */
const base = {
  summary: "",
  hazards: ["Extreme heat"],
  health_outcomes: ["Low birth weight"],
  target_populations: ["Pregnant women"],
  levels: ["Community"],
  stakeholders: [] as string[],
  cost_reasoning: "",
  rationale: "",
  expected_outcomes: "",
  decision_trigger: "",
  trigger_sources: [] as string[],
  references: [] as { citation: string; url: string | null }[],
  case_studies: [] as { citation: string; url: string | null }[],
  images: [] as { url: string; filename: string }[],
};

export const actionItems = [
  {
    ...base,
    id: "recCounsel",
    title: "Provide pregnancy-specific heat health counselling to pregnant women",
    summary: "Counsel pregnant women through community health workers.",
    description:
      "Counsel during outreach and home visits.\n\nCore messages:\n1. Drink water often\n2. Rest in a shaded place",
    action_types: ["Behaviour change and communication"],
    seasons: ["before", "during"],
    departments: ["Health"],
    stakeholders: ["ASHA", "ANM"],
    cost_level: "Low",
    cost_reasoning: "Uses existing outreach contacts.",
    rationale: "Heat in pregnancy raises the risk of low birth weight.",
    references: [
      { citation: "NRDC (2024) Heat and pregnancy", url: "https://www.nrdc.org/heat" },
      { citation: "A citation without a link", url: null },
    ],
    case_studies: [{ citation: "Kilifi co-design", url: "https://example.org/kilifi" }],
  },
  {
    ...base,
    id: "recEquipment",
    title: "Ensure basic equipment and medicines for the heat season",
    description: "Stock ORS, ice packs and thermometers in every facility.",
    action_types: ["Supplies and commodities"],
    seasons: ["before"],
    departments: ["Health"],
    cost_level: "Medium",
  },
  {
    ...base,
    id: "recLabour",
    title: "Safe heat protocols for pregnant workers",
    description: "Rest breaks, water and shade at worksites.",
    action_types: ["Policy and regulation"],
    seasons: ["during", "after"],
    departments: ["Labour and occupational safety"],
    cost_level: "Medium",
  },
  {
    ...base,
    id: "recShelter",
    title: "Set up cool shelters in markets",
    description: "Shaded, ventilated rest areas in busy markets.",
    action_types: ["Infrastructure: new construction"],
    seasons: ["during"],
    departments: ["Local government"],
    cost_level: "High",
  },
];

export const actionList = {
  country: "IN",
  source: "feed",
  published_at: "2026-11-06T10:00:00+00:00",
  items: actionItems,
};
