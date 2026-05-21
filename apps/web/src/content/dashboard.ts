export type DashboardMetric = {
  label: string;
  value: string;
  detail: string;
};

export type DashboardAction = {
  title: string;
  owner: string;
  status: "to-do" | "in-progress" | "done";
};

export type DashboardPlan = {
  name: string;
  created: string;
  edited: string;
  status: "Active" | "Closed";
  collaborators: string[];
};

export type DashboardZone = {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lng: number;
  population: number;
  heat: number;
  flood: number;
  mnch: number;
  water: number;
  level: "crit" | "high" | "med" | "low";
};

export type HealthPost = {
  name: string;
  lat: number;
  lng: number;
};

export const dashboardFilters = {
  geographyOptions: ["Gwalior district", "Kajiado county", "Madhya Pradesh"],
  yearOptions: ["2026 planning cycle", "2025 planning cycle", "2024 planning cycle"],
  hazardOptions: ["heat", "flood", "population", "composite"] as const,
};

export const dashboardMetrics: DashboardMetric[] = [
  {
    label: "Priority zones",
    value: "12",
    detail: "3 critical · 4 high",
  },
  {
    label: "Affected population",
    value: "1.46M",
    detail: "32% in critical zones",
  },
  {
    label: "Facilities exposed",
    value: "15",
    detail: "2 already flagged for response",
  },
  {
    label: "Draft actions",
    value: "9",
    detail: "4 awaiting cross-sector input",
  },
];

export const dashboardActions: DashboardAction[] = [
  {
    title: "Confirm workforce training schedule for priority PHCs",
    owner: "Priya N.",
    status: "in-progress",
  },
  {
    title: "Review district outreach message for pregnant women",
    owner: "Asha R.",
    status: "to-do",
  },
  {
    title: "Validate community water points list for the heat response cycle",
    owner: "Rahul A.",
    status: "done",
  },
];

export const dashboardPlans: DashboardPlan[] = [
  {
    name: "2025 Gwalior extreme heat MNCH planning",
    created: "15 Feb 2025",
    edited: "27 Mar 2025",
    status: "Active",
    collaborators: ["R", "P", "A", "V"],
  },
  {
    name: "2024 Gwalior extreme heat MNCH planning",
    created: "15 Nov 2023",
    edited: "16 Jan 2024",
    status: "Closed",
    collaborators: ["R", "M", "S", "D"],
  },
  {
    name: "2023 Gwalior extreme heat MNCH planning",
    created: "15 Nov 2022",
    edited: "08 Jan 2023",
    status: "Closed",
    collaborators: ["R", "A", "K", "N"],
  },
];

export const dashboardBoundary: [number, number][] = [
  [26.285, 78.045],
  [26.29, 78.14],
  [26.305, 78.22],
  [26.29, 78.31],
  [26.26, 78.34],
  [26.22, 78.35],
  [26.17, 78.34],
  [26.12, 78.31],
  [26.065, 78.285],
  [26.025, 78.24],
  [26.01, 78.18],
  [26.035, 78.11],
  [26.085, 78.065],
  [26.15, 78.035],
  [26.22, 78.025],
  [26.285, 78.045],
];

export const dashboardZones: DashboardZone[] = [
  {
    id: "gwalior_fort",
    name: "Gwalior Fort",
    subtitle: "Historic core",
    lat: 26.2295,
    lng: 78.1686,
    population: 580000,
    heat: 86,
    flood: 48,
    mnch: 72,
    water: 79,
    level: "crit",
  },
  {
    id: "lashkar",
    name: "Lashkar",
    subtitle: "Urban core",
    lat: 26.2124,
    lng: 78.1772,
    population: 340000,
    heat: 76,
    flood: 62,
    mnch: 68,
    water: 70,
    level: "high",
  },
  {
    id: "morar",
    name: "Morar",
    subtitle: "Peri-urban",
    lat: 26.218,
    lng: 78.225,
    population: 220000,
    heat: 71,
    flood: 62,
    mnch: 65,
    water: 55,
    level: "high",
  },
  {
    id: "sumawali",
    name: "Sumawali",
    subtitle: "North-east",
    lat: 26.213,
    lng: 78.285,
    population: 38000,
    heat: 60,
    flood: 45,
    mnch: 52,
    water: 48,
    level: "med",
  },
  {
    id: "dabra",
    name: "Dabra",
    subtitle: "South block",
    lat: 26.115,
    lng: 78.218,
    population: 95000,
    heat: 91,
    flood: 74,
    mnch: 88,
    water: 83,
    level: "crit",
  },
  {
    id: "bhitarwar",
    name: "Bhitarwar",
    subtitle: "South rural",
    lat: 26.075,
    lng: 78.195,
    population: 175000,
    heat: 88,
    flood: 70,
    mnch: 82,
    water: 78,
    level: "crit",
  },
  {
    id: "ghatigaon",
    name: "Ghatigaon",
    subtitle: "West block",
    lat: 26.165,
    lng: 78.085,
    population: 52000,
    heat: 58,
    flood: 38,
    mnch: 50,
    water: 42,
    level: "med",
  },
];

export const dashboardHealthPosts: HealthPost[] = [
  {
    name: "Lashkar CHC",
    lat: 26.213,
    lng: 78.1775,
  },
  {
    name: "Morar PHC",
    lat: 26.217,
    lng: 78.2245,
  },
];
