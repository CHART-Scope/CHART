export type UserRole =
  | "U1_STATE_COUNTY_HEALTH_OFFICER"
  | "U2_STATE_COUNTY_SECTOR_OFFICER"
  | "U3_DISTRICT_SUBCOUNTY_HEALTH_OFFICER"
  | "U4_DISTRICT_SUBCOUNTY_SECTOR_OFFICER"
  | "ADMIN";

export interface GeographyScope {
  id: string;
  name: string;
  level: "country" | "state_county" | "district_subcounty" | "institution";
  countryCode: string;
  parentId?: string;
}

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  geographyScope: GeographyScope;
}
