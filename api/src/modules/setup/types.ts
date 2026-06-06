export type SetupStatus = {
  completed: boolean;
  requiresOnboarding: boolean;
  countryCode?: string;
  countryName?: string;
  rootGeographyId?: string;
  workspaceId?: string;
  firstAdminUserId?: string;
  counts: {
    geographies: number;
    repositoryItems: number;
    workspaceMembers: number;
  };
};

export type SetupOptions = {
  hazardTaxonomies: {
    id: string;
    label: string;
  }[];
};

export type CompleteSetupInput = {
  countryCode: string;
  countryName: string;
  geographyLevelLabel: string;
  hazardTaxonomyIds: string[];
};

export type BootstrapSetupInput = CompleteSetupInput & {
  admin: {
    name: string;
    email: string;
    username: string;
    password: string;
  };
};

export type BootstrapSetupResult = {
  setup: SetupStatus;
  admin: {
    userId: string;
    username: string;
    email: string;
  };
};

export type SetupErrorCode =
  | "SETUP_FORBIDDEN"
  | "SETUP_COUNTRY_REQUIRED"
  | "SETUP_HAZARD_REQUIRED"
  | "SETUP_HAZARD_INVALID"
  | "SETUP_BOOTSTRAP_LOCKED"
  | "SETUP_ADMIN_REQUIRED"
  | "SETUP_ADMIN_PASSWORD_REQUIRED"
  | "SETUP_IDENTITY_CONFIG_INVALID"
  | "SETUP_IDENTITY_ADMIN_AUTH_FAILED"
  | "SETUP_IDENTITY_CLIENT_MISSING"
  | "SETUP_IDENTITY_GROUP_FAILED"
  | "SETUP_IDENTITY_PASSWORD_REJECTED"
  | "SETUP_IDENTITY_ROLE_MISSING"
  | "SETUP_IDENTITY_UNAVAILABLE"
  | "SETUP_IDENTITY_USER_CONFLICT"
  | "SETUP_IDENTITY_USER_CREATE_FAILED";

export type SetupErrorResponse = {
  error: SetupErrorCode;
};

const setupCountsSchema = {
  type: "object",
  required: ["geographies", "repositoryItems", "workspaceMembers"],
  properties: {
    geographies: { type: "number" },
    repositoryItems: { type: "number" },
    workspaceMembers: { type: "number" },
  },
} as const;

export const setupStatusSchema = {
  type: "object",
  required: ["completed", "requiresOnboarding", "counts"],
  properties: {
    completed: { type: "boolean" },
    requiresOnboarding: { type: "boolean" },
    countryCode: { type: "string" },
    countryName: { type: "string" },
    rootGeographyId: { type: "string" },
    workspaceId: { type: "string" },
    firstAdminUserId: { type: "string" },
    counts: setupCountsSchema,
  },
} as const;

export const setupOptionsSchema = {
  type: "object",
  required: ["hazardTaxonomies"],
  properties: {
    hazardTaxonomies: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "label"],
        properties: {
          id: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
} as const;

export const completeSetupBodySchema = {
  type: "object",
  required: ["countryCode", "countryName", "geographyLevelLabel", "hazardTaxonomyIds"],
  properties: {
    countryCode: { type: "string", minLength: 2 },
    countryName: { type: "string", minLength: 2 },
    geographyLevelLabel: { type: "string", minLength: 2 },
    hazardTaxonomyIds: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    },
  },
} as const;

const setupAdminSchema = {
  type: "object",
  required: ["name", "email", "username", "password"],
  properties: {
    name: { type: "string", minLength: 2 },
    email: { type: "string", minLength: 3 },
    username: { type: "string", minLength: 2 },
    password: { type: "string", minLength: 8 },
  },
} as const;

export const bootstrapSetupBodySchema = {
  type: "object",
  required: [
    "countryCode",
    "countryName",
    "geographyLevelLabel",
    "hazardTaxonomyIds",
    "admin",
  ],
  properties: {
    ...completeSetupBodySchema.properties,
    admin: setupAdminSchema,
  },
} as const;

export const bootstrapSetupResultSchema = {
  type: "object",
  required: ["setup", "admin"],
  properties: {
    setup: setupStatusSchema,
    admin: {
      type: "object",
      required: ["userId", "username", "email"],
      properties: {
        userId: { type: "string" },
        username: { type: "string" },
        email: { type: "string" },
      },
    },
  },
} as const;

export const setupErrorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;
