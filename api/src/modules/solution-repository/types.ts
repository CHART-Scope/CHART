export interface SolutionRepositoryQuery {
  hazard?: string;
  solutionType?: string;
  cost?: string;
  search?: string;
  status?: string;
  limit?: number;
}

export interface SolutionRepositoryTaxonomyRecord {
  id: string;
  type: string;
  label: string;
}

export interface SolutionRepositoryLinkRecord {
  label: string;
  url: string;
}

export interface SolutionRepositoryAssetRecord {
  id: string;
  kind: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageUrl: string | null;
  attribution: string | null;
}

export interface SolutionRepositoryItemRecord {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  description: string | null;
  implementationNotes: string | null;
  costOfImplementation: string | null;
  maintenanceRequirement: string | null;
  timeToImplement: string | null;
  evidenceLevel: string | null;
  sourceId: string;
  sourceRecordId: string | null;
  sourceVersion: string | null;
  sourceUpdatedAt: string | null;
  license: string | null;
  attribution: string | null;
  status: string;
  taxonomies: SolutionRepositoryTaxonomyRecord[];
  links: SolutionRepositoryLinkRecord[];
  assets: SolutionRepositoryAssetRecord[];
}

export interface SolutionRepositoryListResponse {
  items: SolutionRepositoryItemRecord[];
  total: number;
}

export type SolutionRepositoryErrorCode = "SOLUTION_NOT_FOUND";

export interface SolutionRepositoryErrorResponse {
  error: SolutionRepositoryErrorCode;
}

export const solutionRepositoryTaxonomySchema = {
  type: "object",
  required: ["id", "type", "label"],
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    label: { type: "string" },
  },
} as const;

export const solutionRepositoryLinkSchema = {
  type: "object",
  required: ["label", "url"],
  properties: {
    label: { type: "string" },
    url: { type: "string" },
  },
} as const;

export const solutionRepositoryAssetSchema = {
  type: "object",
  required: [
    "id",
    "kind",
    "filename",
    "mimeType",
    "sizeBytes",
    "storageUrl",
    "attribution",
  ],
  properties: {
    id: { type: "string" },
    kind: { type: "string" },
    filename: { type: "string" },
    mimeType: { type: ["string", "null"] },
    sizeBytes: { type: ["number", "null"] },
    storageUrl: { type: ["string", "null"] },
    attribution: { type: ["string", "null"] },
  },
} as const;

export const solutionRepositoryItemSchema = {
  type: "object",
  required: [
    "id",
    "slug",
    "name",
    "summary",
    "description",
    "implementationNotes",
    "costOfImplementation",
    "maintenanceRequirement",
    "timeToImplement",
    "evidenceLevel",
    "sourceId",
    "sourceRecordId",
    "sourceVersion",
    "sourceUpdatedAt",
    "license",
    "attribution",
    "status",
    "taxonomies",
    "links",
    "assets",
  ],
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    name: { type: "string" },
    summary: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    implementationNotes: { type: ["string", "null"] },
    costOfImplementation: { type: ["string", "null"] },
    maintenanceRequirement: { type: ["string", "null"] },
    timeToImplement: { type: ["string", "null"] },
    evidenceLevel: { type: ["string", "null"] },
    sourceId: { type: "string" },
    sourceRecordId: { type: ["string", "null"] },
    sourceVersion: { type: ["string", "null"] },
    sourceUpdatedAt: { type: ["string", "null"] },
    license: { type: ["string", "null"] },
    attribution: { type: ["string", "null"] },
    status: { type: "string" },
    taxonomies: {
      type: "array",
      items: solutionRepositoryTaxonomySchema,
    },
    links: {
      type: "array",
      items: solutionRepositoryLinkSchema,
    },
    assets: {
      type: "array",
      items: solutionRepositoryAssetSchema,
    },
  },
} as const;

export const solutionRepositoryListResponseSchema = {
  type: "object",
  required: ["items", "total"],
  properties: {
    items: {
      type: "array",
      items: solutionRepositoryItemSchema,
    },
    total: { type: "number" },
  },
} as const;

export const solutionRepositoryParamsSchema = {
  type: "object",
  required: ["slug"],
  properties: {
    slug: { type: "string" },
  },
} as const;

export const solutionRepositoryQuerySchema = {
  type: "object",
  properties: {
    hazard: { type: "string" },
    solutionType: { type: "string" },
    cost: { type: "string" },
    search: { type: "string" },
    status: { type: "string" },
    limit: { type: "integer", minimum: 1, maximum: 100 },
  },
} as const;

export const solutionRepositoryErrorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;
