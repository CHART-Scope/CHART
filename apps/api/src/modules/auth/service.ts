import type { CurrentUser } from "./types.js";

const demoCurrentUser: CurrentUser = {
  id: "user-u1-demo",
  name: "Demo Health Officer",
  role: "U1_STATE_COUNTY_HEALTH_OFFICER",
  geographyScope: {
    id: "geo-madhya-pradesh",
    name: "Madhya Pradesh",
    level: "state_county",
    countryCode: "IN",
  },
};

export function getCurrentUser(): CurrentUser {
  return demoCurrentUser;
}
