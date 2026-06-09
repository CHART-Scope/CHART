import type { ChartRole } from "../auth/types.js";

export type UserStatus = "active" | "disabled";

export type UserGeographyScopeRecord = {
  geographyId: string;
  path: string;
  name: string;
  levelLabel: string;
};

export type UserRecord = {
  userId: string;
  username: string;
  email?: string;
  phone?: string;
  displayName: string;
  status: UserStatus;
  roles: ChartRole[];
  geographyScopes: UserGeographyScopeRecord[];
};

export type CreateUserInput = {
  name: string;
  email: string;
  phone?: string;
  username: string;
  password: string;
  roles: ChartRole[];
  geographyIds: string[];
};

export type UserErrorCode =
  | "USER_FORBIDDEN"
  | "USER_NAME_REQUIRED"
  | "USER_EMAIL_REQUIRED"
  | "USER_USERNAME_REQUIRED"
  | "USER_PASSWORD_REQUIRED"
  | "USER_ROLE_REQUIRED"
  | "USER_ROLE_INVALID"
  | "USER_GEOGRAPHY_REQUIRED"
  | "USER_GEOGRAPHY_INVALID"
  | "USER_NOT_FOUND"
  | "USER_CANNOT_DISABLE_SELF"
  | "USER_IDENTITY_UNAVAILABLE"
  | "USER_IDENTITY_CONFIG_INVALID"
  | "USER_IDENTITY_ADMIN_AUTH_FAILED"
  | "USER_IDENTITY_CLIENT_MISSING"
  | "USER_IDENTITY_ROLE_MISSING"
  | "USER_IDENTITY_GROUP_FAILED"
  | "USER_IDENTITY_USER_CONFLICT"
  | "USER_IDENTITY_USER_CREATE_FAILED"
  | "USER_IDENTITY_DISABLE_FAILED";

export type UserErrorResponse = {
  error: UserErrorCode;
};

export const userGeographyScopeSchema = {
  type: "object",
  required: ["geographyId", "path", "name", "levelLabel"],
  properties: {
    geographyId: { type: "string" },
    path: { type: "string" },
    name: { type: "string" },
    levelLabel: { type: "string" },
  },
} as const;

export const userRecordSchema = {
  type: "object",
  required: ["userId", "username", "displayName", "status", "roles", "geographyScopes"],
  properties: {
    userId: { type: "string" },
    username: { type: "string" },
    email: { type: "string" },
    phone: { type: "string" },
    displayName: { type: "string" },
    status: { type: "string", enum: ["active", "disabled"] },
    roles: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "chart_admin",
          "content_editor",
          "health_planning_lead",
          "cross_sector_planning_lead",
          "health_implementation_officer",
          "cross_sector_implementation_officer",
          "public_viewer",
        ],
      },
    },
    geographyScopes: {
      type: "array",
      items: userGeographyScopeSchema,
    },
  },
} as const;

export const createUserBodySchema = {
  type: "object",
  required: ["name", "email", "username", "password", "roles", "geographyIds"],
  properties: {
    name: { type: "string", minLength: 2 },
    email: { type: "string", minLength: 3 },
    phone: { type: "string", minLength: 3 },
    username: { type: "string", minLength: 2 },
    password: { type: "string", minLength: 8 },
    roles: {
      type: "array",
      minItems: 1,
      items: userRecordSchema.properties.roles.items,
    },
    geographyIds: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    },
  },
} as const;

export const userParamsSchema = {
  type: "object",
  required: ["userId"],
  properties: {
    userId: { type: "string" },
  },
} as const;

export const userErrorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;
