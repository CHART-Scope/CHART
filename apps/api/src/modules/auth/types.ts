export type UserRole =
  | "U1_HEALTH_LEAD"
  | "U2_CROSS_SECTOR_LEAD"
  | "U3_DISTRICT_HEALTH_OFFICER"
  | "U4_SYSTEM_ADMIN";

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  geographyScope: {
    id: string;
    name: string;
    level: "state_county" | "district_subcounty";
    countryCode: string;
  };
}
