import type { CurrentUser } from "./types.js";

const mockCurrentUser: CurrentUser = {
  id: "user-u1-demo",
  name: "Demo Health Lead",
  role: "U1_HEALTH_LEAD",
  geographyScope: {
    id: "geo-madhya-pradesh",
    name: "Madhya Pradesh",
    level: "state_county",
    countryCode: "IN"
  }
};

export function getCurrentUser(): CurrentUser {
  return mockCurrentUser;
}
