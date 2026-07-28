export type LevelConfig = {
  options: string[];
  /** Optional second-level lookup keyed by first-level choice */
  sub?: Record<string, string[]>;
};

export type CountryGeo = Record<string, LevelConfig>;

const KE_COUNTIES = [
  "Mombasa",
  "Kwale",
  "Kilifi",
  "Tana River",
  "Lamu",
  "Taita-Taveta",
  "Garissa",
  "Wajir",
  "Mandera",
  "Marsabit",
  "Isiolo",
  "Meru",
  "Tharaka-Nithi",
  "Embu",
  "Kitui",
  "Machakos",
  "Makueni",
  "Nyandarua",
  "Nyeri",
  "Kirinyaga",
  "Murang'a",
  "Kiambu",
  "Turkana",
  "West Pokot",
  "Samburu",
  "Trans Nzoia",
  "Uasin Gishu",
  "Elgeyo-Marakwet",
  "Nandi",
  "Baringo",
  "Laikipia",
  "Nakuru",
  "Narok",
  "Kajiado",
  "Kericho",
  "Bomet",
  "Kakamega",
  "Vihiga",
  "Bungoma",
  "Busia",
  "Siaya",
  "Kisumu",
  "Homa Bay",
  "Migori",
  "Kisii",
  "Nyamira",
  "Nairobi",
];

const KE_SUB: Record<string, string[]> = {
  Mombasa: ["Changamwe", "Jomvu", "Kisauni", "Likoni", "Mvita", "Nyali"],
  Kwale: ["Kinango", "Lunga Lunga", "Matuga", "Msambweni"],
  Kilifi: [
    "Ganze",
    "Kaloleni",
    "Kilifi North",
    "Kilifi South",
    "Magarini",
    "Malindi",
    "Rabai",
  ],
  "Tana River": ["Bura", "Galole", "Garsen"],
  Lamu: ["Lamu East", "Lamu West"],
  "Taita-Taveta": ["Mwatate", "Taveta", "Voi", "Wundanyi"],
  Garissa: [
    "Balambala",
    "Dadaab",
    "Fafi",
    "Garissa Township",
    "Hulugho",
    "Ijara",
    "Lagdera",
  ],
  Kajiado: [
    "Kajiado Central",
    "Kajiado East",
    "Kajiado North",
    "Kajiado South",
    "Kajiado West",
  ],
  Nairobi: [
    "Dagoretti North",
    "Dagoretti South",
    "Embakasi Central",
    "Embakasi East",
    "Embakasi North",
    "Embakasi South",
    "Embakasi West",
    "Kamukunji",
    "Kasarani",
    "Kibra",
    "Lang'ata",
    "Makadara",
    "Mathare",
    "Roysambu",
    "Ruaraka",
    "Starehe",
    "Westlands",
  ],
};

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
    National: { options: ["Kenya"] },
    County: { options: KE_COUNTIES },
    "Sub-county": { options: KE_COUNTIES, sub: KE_SUB },
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
