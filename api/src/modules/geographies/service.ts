import { and, asc, eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { geographies } from "../../db/schema.js";
import type {
  GeographyErrorCode,
  GeographyRecord,
  ListGeographiesQuery,
  ResolveGeographyQuery,
} from "./types.js";

export class GeographyError extends Error {
  constructor(
    public readonly code: GeographyErrorCode,
    public readonly statusCode: number,
    message: string = code,
  ) {
    super(message);
  }
}

export interface GeographyService {
  listGeographies(query?: ListGeographiesQuery): Promise<GeographyRecord[]>;
  resolveGeography(query: ResolveGeographyQuery): Promise<GeographyRecord>;
}

export function createGeographyService(): GeographyService {
  return {
    async listGeographies(query = {}) {
      const filters = [
        query.countryCode ? eq(geographies.countryCode, query.countryCode) : undefined,
        query.parentId ? eq(geographies.parentId, query.parentId) : undefined,
      ].filter((filter) => filter !== undefined);

      const rows = await db
        .select()
        .from(geographies)
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(
          asc(geographies.countryCode),
          asc(geographies.level),
          asc(geographies.sortOrder),
          asc(geographies.name),
        );

      return rows.map(mapGeographyRecord);
    },

    async resolveGeography(query) {
      if (!query.id && !query.path) {
        throw new GeographyError("GEOGRAPHY_QUERY_REQUIRED", 400);
      }

      const rows = await db
        .select()
        .from(geographies)
        .where(
          query.id
            ? eq(geographies.id, query.id)
            : eq(geographies.path, normalizeGeographyPath(query.path)),
        )
        .limit(1);

      const geography = rows[0];

      if (!geography) {
        throw new GeographyError("GEOGRAPHY_NOT_FOUND", 404);
      }

      return mapGeographyRecord(geography);
    },
  };
}

export function normalizeGeographyPath(path: string | undefined) {
  if (!path) {
    return "";
  }

  const trimmed = path.trim();
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

function mapGeographyRecord(row: typeof geographies.$inferSelect): GeographyRecord {
  return {
    id: row.id,
    countryCode: row.countryCode,
    level: row.level,
    levelLabel: row.levelLabel,
    name: row.name,
    parentId: row.parentId,
    externalCode: row.externalCode,
    path: row.path,
    sortOrder: row.sortOrder,
  };
}
