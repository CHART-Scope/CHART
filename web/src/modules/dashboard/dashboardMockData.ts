export type KpiMetric = {
  label: string;
  value: string;
  detail: string;
  trend?: "up" | "down" | "neutral";
  accentColor?: string;
};

export type RiskGroup = {
  rank: number;
  groupName: string;
  healthEffect: string;
};

export type PendingAction = {
  id: string;
  title: string;
  assignee: string;
  status: string;
  statusVariant: "to-do" | "in-progress" | "done" | "review" | "waiting";
};

export type ClimateProjection = {
  year: number;
  historical: number | null;
  projected: number | null;
};

export type CommunityConcern = {
  id: string;
  label: string;
  mentions: number;
};

export function getKpiMetrics(_geographyId?: string): KpiMetric[] {
  return [
    {
      label: "Peak temperature",
      value: "48\u00B0C",
      detail: "+2.1\u00B0C vs. 20-year avg",
      trend: "up",
      accentColor: "var(--red)",
    },
    {
      label: "Extreme heat days",
      value: "103",
      detail: "Days above 40\u00B0C this year",
      trend: "up",
      accentColor: "var(--amber)",
    },
    {
      label: "Days to next heat season",
      value: "47",
      detail: "Estimated start: late March",
      accentColor: "var(--green)",
    },
    {
      label: "Population at risk",
      value: "2.4M",
      detail: "Across 12 high-risk zones",
      trend: "up",
      accentColor: "var(--purple)",
    },
  ];
}

export function getRiskGroups(_geographyId?: string): RiskGroup[] {
  return [
    {
      rank: 1,
      groupName: "Children under 5",
      healthEffect: "Heat stroke, dehydration",
    },
    {
      rank: 2,
      groupName: "Outdoor workers",
      healthEffect: "Heat exhaustion, renal stress",
    },
    { rank: 3, groupName: "Elderly (65+)", healthEffect: "Cardiovascular events" },
    { rank: 4, groupName: "Pregnant women", healthEffect: "Preterm birth risk" },
    {
      rank: 5,
      groupName: "Chronic illness patients",
      healthEffect: "Medication efficacy",
    },
  ];
}

export function getPendingActions(_geographyId?: string): PendingAction[] {
  return [
    {
      id: "a1",
      title: "Deploy early warning SMS system",
      assignee: "District Health Office",
      status: "In progress",
      statusVariant: "in-progress",
    },
    {
      id: "a2",
      title: "Map cooling centres for Zone 3",
      assignee: "Cross-sector lead",
      status: "To do",
      statusVariant: "to-do",
    },
    {
      id: "a3",
      title: "Update heat action plan for 2026",
      assignee: "Health planning lead",
      status: "Review",
      statusVariant: "review",
    },
    {
      id: "a4",
      title: "Procure ORS supplies for clinics",
      assignee: "Supply chain officer",
      status: "Waiting",
      statusVariant: "waiting",
    },
  ];
}

export function getClimateProjections(_geographyId?: string): ClimateProjection[] {
  return [
    { year: 2000, historical: 38.2, projected: null },
    { year: 2003, historical: 39.1, projected: null },
    { year: 2006, historical: 39.8, projected: null },
    { year: 2009, historical: 40.4, projected: null },
    { year: 2012, historical: 41.0, projected: null },
    { year: 2015, historical: 42.1, projected: null },
    { year: 2018, historical: 43.5, projected: null },
    { year: 2021, historical: 44.8, projected: null },
    { year: 2024, historical: 46.2, projected: 46.2 },
    { year: 2027, historical: null, projected: 47.5 },
    { year: 2030, historical: null, projected: 48.9 },
    { year: 2033, historical: null, projected: 49.8 },
    { year: 2036, historical: null, projected: 50.4 },
  ];
}

export function getCommunityConcerns(_geographyId?: string): CommunityConcern[] {
  return [
    { id: "c1", label: "Water shortages during heatwaves", mentions: 342 },
    { id: "c2", label: "Lack of shaded public spaces", mentions: 289 },
    { id: "c3", label: "School closures due to heat", mentions: 217 },
    { id: "c4", label: "Increased vector-borne disease", mentions: 185 },
  ];
}

export function getHealthResilienceScore(_geographyId?: string): {
  score: number;
  maxScore: number;
  label: string;
} {
  return { score: 62, maxScore: 100, label: "Moderate preparedness" };
}
