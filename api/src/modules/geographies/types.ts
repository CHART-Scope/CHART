import type { GeographyLevelValue } from "../../db/schema.js";

export interface GeographyRecord {
  id: string;
  countryCode: string;
  level: GeographyLevelValue;
  levelLabel: string;
  name: string;
  parentId: string | null;
  externalCode: string | null;
  path: string;
  sortOrder: number;
}

export interface ListGeographiesQuery {
  countryCode?: string;
  parentId?: string;
}

export interface ResolveGeographyQuery {
  id?: string;
  path?: string;
}

export type GeographyErrorCode = "GEOGRAPHY_QUERY_REQUIRED" | "GEOGRAPHY_NOT_FOUND";

export interface GeographyErrorResponse {
  error: GeographyErrorCode;
}

export const geographyRecordSchema = {
  type: "object",
  required: [
    "id",
    "countryCode",
    "level",
    "levelLabel",
    "name",
    "parentId",
    "externalCode",
    "path",
    "sortOrder",
  ],
  properties: {
    id: { type: "string" },
    countryCode: { type: "string" },
    level: {
      type: "string",
      enum: ["country", "geo_level_1", "geo_level_2", "geo_level_3"],
    },
    levelLabel: { type: "string" },
    name: { type: "string" },
    parentId: { type: ["string", "null"] },
    externalCode: { type: ["string", "null"] },
    path: { type: "string" },
    sortOrder: { type: "number" },
  },
} as const;

export const geographyErrorResponseSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
  },
} as const;
