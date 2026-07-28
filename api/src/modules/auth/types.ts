export const chartRoles = [
  "chart_admin",
  "content_editor",
  "health_planning_lead",
  "cross_sector_planning_lead",
  "health_implementation_officer",
  "cross_sector_implementation_officer",
  "public_viewer",
] as const;

export const legacyChartRoleAliases = {
  u1_health_lead: "health_planning_lead",
  u2_cross_sector_lead: "cross_sector_planning_lead",
  u3_district_health_officer: "health_implementation_officer",
  u4_district_cross_sector_officer: "cross_sector_implementation_officer",
  u5_public_visitor: "public_viewer",
} as const satisfies Record<string, ChartRole>;

export const geographyLevels = [
  "country",
  "geo_level_1",
  "geo_level_2",
  "geo_level_3",
] as const;

export type ChartRole = (typeof chartRoles)[number];
export type GeographyLevel = (typeof geographyLevels)[number];

export interface CurrentUserContext {
  userId: string;
  username: string;
  email?: string;
  roles: ChartRole[];
  geographyScopes: string[];
  activeGeographyId?: string;
  geographyLevel?: GeographyLevel;
}

export interface KeycloakTokenClaims {
  sub?: string;
  preferred_username?: string;
  email?: string;
  exp?: number;
  nbf?: number;
  iss?: string;
  aud?: string | string[];
  groups?: unknown;
  realm_access?: {
    roles?: unknown;
  };
  resource_access?: Record<
    string,
    {
      roles?: unknown;
    }
  >;
}

export interface AuthConfig {
  issuerUrl?: string;
  clientId: string;
  jwksUrl?: string;
  clockSkewSeconds: number;
}

export interface AuthRequestInput {
  authorization?: string;
  activeGeographyId?: string;
}

export type AuthErrorCode =
  | "AUTH_TOKEN_REQUIRED"
  | "AUTH_TOKEN_INVALID"
  | "AUTH_CONFIG_INVALID"
  | "ACTIVE_GEOGRAPHY_OUT_OF_SCOPE"
  | "GEOGRAPHY_QUERY_REQUIRED"
  | "GEOGRAPHY_OUT_OF_SCOPE";

export interface ErrorResponse {
  error: AuthErrorCode;
}

export const currentUserContextSchema = {
  type: "object",
  required: ["userId", "username", "roles", "geographyScopes"],
  properties: {
    userId: { type: "string" },
    username: { type: "string" },
    email: { type: "string" },
    roles: {
      type: "array",
      items: { type: "string", enum: [...chartRoles] },
    },
    geographyScopes: {
      type: "array",
      items: { type: "string" },
    },
    activeGeographyId: { type: "string" },
    geographyLevel: { type: "string", enum: [...geographyLevels] },
  },
} as const;

export const geographyAccessResponseSchema = {
  type: "object",
  required: ["canAccess", "geographyPath", "userId"],
  properties: {
    canAccess: { type: "boolean" },
    geographyPath: { type: "string" },
    userId: { type: "string" },
  },
} as const;

export const authErrorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;
