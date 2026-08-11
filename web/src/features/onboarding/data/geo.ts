export type LevelConfig = {
  options: string[];
  /** Optional second-level lookup keyed by first-level choice */
  sub?: Record<string, string[]>;
};

export type CountryGeo = Record<string, LevelConfig>;

// Only expose places that have an activated CHART model mapping. The recovered
// Kenya release is currently approved for product testing in Kajiado only.
const KE_COUNTIES = ["Kajiado"];

const IN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const IN_DISTRICTS: Record<string, string[]> = {
  "Madhya Pradesh": [
    "Bhopal",
    "Gwalior",
    "Indore",
    "Jabalpur",
    "Rewa",
    "Sagar",
    "Satna",
    "Ujjain",
  ],
  Maharashtra: [
    "Nagpur",
    "Pune",
    "Mumbai Suburban",
    "Nashik",
    "Aurangabad",
    "Amravati",
  ],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner"],
  "Uttar Pradesh": [
    "Lucknow",
    "Agra",
    "Varanasi",
    "Kanpur",
    "Prayagraj",
    "Meerut",
  ],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Salem", "Tiruchirappalli"],
  Karnataka: [
    "Bengaluru Urban",
    "Mysuru",
    "Hubli-Dharwad",
    "Belagavi",
    "Mangaluru",
  ],
};

export const GEO_DATA: Record<string, CountryGeo> = {
  India: {
    National: { options: ["India"] },
    State: { options: IN_STATES },
    District: {
      options: Object.keys(IN_DISTRICTS),
      sub: IN_DISTRICTS,
    },
  },
  Kenya: {
    County: { options: KE_COUNTIES },
  },
};

export const COUNTRIES = ["India", "Kenya"] as const;
export type Country = (typeof COUNTRIES)[number];

/** Human-readable label for the second-level select, given a level */
export function geoLabelForLevel(level: string): string {
  if (level === "District") return "State";
  if (level === "Sub-county") return "County";
  return level;
}

export function subGeoLabelForLevel(level: string): string {
  if (level === "District") return "District";
  return "Sub-county";
}
