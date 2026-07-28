export interface ChartRepositorySolutionQuery {
  hazard?: string;
  solutionType?: string;
  cost?: string;
  search?: string;
  status?: string;
  limit?: number;
}

export interface ChartRepositorySolutionTaxonomyRecord {
  id: string;
  type: string;
  label: string;
}

export interface ChartRepositorySolutionLinkRecord {
  label: string;
  url: string;
}

export interface ChartRepositorySolutionAssetRecord {
  id: string;
  kind: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  storageUrl: string | null;
  attribution: string | null;
}

export interface ChartRepositorySolutionItemRecord {
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
  taxonomies: ChartRepositorySolutionTaxonomyRecord[];
  links: ChartRepositorySolutionLinkRecord[];
  assets: ChartRepositorySolutionAssetRecord[];
}

export interface ChartRepositorySolutionListResponse {
  items: ChartRepositorySolutionItemRecord[];
  total: number;
}

export type ChartRepositorySolutionErrorCode = "SOLUTION_NOT_FOUND";

export interface ChartRepositorySolutionErrorResponse {
  error: ChartRepositorySolutionErrorCode;
}

export const chartRepositorySolutionTaxonomySchema = {
  type: "object",
  required: ["id", "type", "label"],
  properties: {
    id: { type: "string" },
    type: { type: "string" },
    label: { type: "string" },
  },
} as const;

export const chartRepositorySolutionLinkSchema = {
  type: "object",
  required: ["label", "url"],
  properties: {
    label: { type: "string" },
    url: { type: "string" },
  },
} as const;

export const chartRepositorySolutionAssetSchema = {
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

export const chartRepositorySolutionItemSchema = {
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
      items: chartRepositorySolutionTaxonomySchema,
    },
    links: {
      type: "array",
      items: chartRepositorySolutionLinkSchema,
    },
    assets: {
      type: "array",
      items: chartRepositorySolutionAssetSchema,
    },
  },
} as const;

export const chartRepositorySolutionListResponseSchema = {
  type: "object",
  required: ["items", "total"],
  properties: {
    items: {
      type: "array",
      items: chartRepositorySolutionItemSchema,
    },
    total: { type: "number" },
  },
} as const;

export const chartRepositorySolutionParamsSchema = {
  type: "object",
  required: ["slug"],
  properties: {
    slug: { type: "string" },
  },
} as const;

export const chartRepositorySolutionQuerySchema = {
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

export const chartRepositorySolutionErrorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;

export type ChartRepositoryHazardItem = {
  id: string;
  label: string;
  description: string | null;
  hazardGroup: string | null;
  imageUrl: string | null;
  solutionCount: number;
};

export type ChartRepositoryHazardListResponse = {
  items: ChartRepositoryHazardItem[];
};

export type ChartRepositoryHazardSolution = {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
};

export type ChartRepositoryHazardDetailResponse = ChartRepositoryHazardItem & {
  solutions: ChartRepositoryHazardSolution[];
};

export const chartRepositoryHazardItemSchema = {
  type: "object",
  required: ["id", "label", "description", "hazardGroup", "imageUrl", "solutionCount"],
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    description: { type: ["string", "null"] },
    hazardGroup: { type: ["string", "null"] },
    imageUrl: { type: ["string", "null"] },
    solutionCount: { type: "number" },
  },
} as const;

export const chartRepositoryHazardSolutionSchema = {
  type: "object",
  required: ["id", "name", "slug", "summary"],
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    slug: { type: "string" },
    summary: { type: ["string", "null"] },
  },
} as const;

export const chartRepositoryHazardListResponseSchema = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: chartRepositoryHazardItemSchema,
    },
  },
} as const;

export const chartRepositoryHazardDetailResponseSchema = {
  type: "object",
  required: [
    "id",
    "label",
    "description",
    "hazardGroup",
    "imageUrl",
    "solutionCount",
    "solutions",
  ],
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    description: { type: ["string", "null"] },
    hazardGroup: { type: ["string", "null"] },
    imageUrl: { type: ["string", "null"] },
    solutionCount: { type: "number" },
    solutions: {
      type: "array",
      items: chartRepositoryHazardSolutionSchema,
    },
  },
} as const;

export const chartRepositoryHazardParamsSchema = {
  type: "object",
  required: ["hazardId"],
  properties: {
    hazardId: { type: "string" },
  },
} as const;

export const chartRepositoryHazardErrorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;
