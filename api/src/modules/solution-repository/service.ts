import { and, asc, count, eq, ilike, inArray, or, type SQL } from "drizzle-orm";

import { db } from "../../db/client.js";
import {
  solutionRepositoryAssets,
  solutionRepositoryItems,
  solutionRepositoryItemTaxonomies,
  solutionRepositoryLinks,
  solutionRepositoryTaxonomies,
} from "../../db/schema.js";
import type {
  SolutionRepositoryAssetRecord,
  SolutionRepositoryErrorCode,
  SolutionRepositoryItemRecord,
  SolutionRepositoryLinkRecord,
  SolutionRepositoryListResponse,
  SolutionRepositoryQuery,
  SolutionRepositoryTaxonomyRecord,
} from "./types.js";

type SolutionItemRow = typeof solutionRepositoryItems.$inferSelect;

export class SolutionRepositoryError extends Error {
  constructor(
    public readonly code: SolutionRepositoryErrorCode,
    public readonly statusCode: number,
    message: string = code,
  ) {
    super(message);
  }
}

export interface SolutionRepositoryService {
  listSolutions(
    query?: SolutionRepositoryQuery,
  ): Promise<SolutionRepositoryListResponse>;
  getSolutionBySlug(slug: string): Promise<SolutionRepositoryItemRecord>;
  listTaxonomies(): Promise<SolutionRepositoryTaxonomyRecord[]>;
}

export function createSolutionRepositoryService(): SolutionRepositoryService {
  return {
    async listSolutions(query = {}) {
      const allowedIds = await resolveTaxonomyFilteredSolutionIds(query);

      if (allowedIds && allowedIds.size === 0) {
        return { items: [], total: 0 };
      }

      const filters = buildItemFilters(query, allowedIds);
      const whereClause = filters.length > 0 ? and(...filters) : undefined;
      const [rows, totalRows] = await Promise.all([
        db
          .select()
          .from(solutionRepositoryItems)
          .where(whereClause)
          .orderBy(asc(solutionRepositoryItems.name))
          .limit(resolveLimit(query.limit)),
        db.select({ total: count() }).from(solutionRepositoryItems).where(whereClause),
      ]);
      const items = await hydrateSolutions(rows);
      const total = Number(totalRows[0]?.total ?? items.length);

      return { items, total };
    },

    async getSolutionBySlug(slug) {
      const rows = await db
        .select()
        .from(solutionRepositoryItems)
        .where(eq(solutionRepositoryItems.slug, slug))
        .limit(1);
      const item = rows[0];

      if (!item) {
        throw new SolutionRepositoryError("SOLUTION_NOT_FOUND", 404);
      }

      return (await hydrateSolutions([item]))[0];
    },

    async listTaxonomies() {
      const rows = await db
        .select({
          id: solutionRepositoryTaxonomies.id,
          type: solutionRepositoryTaxonomies.type,
          label: solutionRepositoryTaxonomies.label,
        })
        .from(solutionRepositoryTaxonomies)
        .orderBy(
          asc(solutionRepositoryTaxonomies.type),
          asc(solutionRepositoryTaxonomies.label),
        );

      return rows;
    },
  };
}

function buildItemFilters(
  query: SolutionRepositoryQuery,
  allowedIds: Set<string> | undefined,
) {
  const filters: SQL[] = [];
  const search = query.search?.trim();
  const cost = query.cost?.trim();
  const status = query.status?.trim();

  if (allowedIds) {
    filters.push(inArray(solutionRepositoryItems.id, [...allowedIds]));
  }

  if (cost) {
    filters.push(eq(solutionRepositoryItems.costOfImplementation, cost));
  }

  if (status) {
    filters.push(eq(solutionRepositoryItems.status, status));
  }

  if (search) {
    const searchPattern = `%${search}%`;
    const searchFilter = or(
      ilike(solutionRepositoryItems.name, searchPattern),
      ilike(solutionRepositoryItems.summary, searchPattern),
      ilike(solutionRepositoryItems.description, searchPattern),
    );

    if (searchFilter) {
      filters.push(searchFilter);
    }
  }

  return filters;
}

async function resolveTaxonomyFilteredSolutionIds(query: SolutionRepositoryQuery) {
  const taxonomyFilters = [
    query.hazard ? { type: "hazard", value: query.hazard } : undefined,
    query.solutionType
      ? { type: "solution_type", value: query.solutionType }
      : undefined,
  ].filter((filter) => filter !== undefined);

  if (taxonomyFilters.length === 0) {
    return undefined;
  }

  let allowedSolutionIds: Set<string> | undefined;

  for (const filter of taxonomyFilters) {
    const taxonomyIds = await findTaxonomyIds(filter.type, filter.value);

    if (taxonomyIds.length === 0) {
      return new Set<string>();
    }

    const rows = await db
      .select({ solutionId: solutionRepositoryItemTaxonomies.solutionId })
      .from(solutionRepositoryItemTaxonomies)
      .where(inArray(solutionRepositoryItemTaxonomies.taxonomyId, taxonomyIds));
    const matchingSolutionIds = new Set(rows.map((row) => row.solutionId));

    allowedSolutionIds = allowedSolutionIds
      ? intersectSets(allowedSolutionIds, matchingSolutionIds)
      : matchingSolutionIds;
  }

  return allowedSolutionIds;
}

async function findTaxonomyIds(type: string, value: string) {
  const rows = await db
    .select({
      id: solutionRepositoryTaxonomies.id,
      label: solutionRepositoryTaxonomies.label,
    })
    .from(solutionRepositoryTaxonomies)
    .where(eq(solutionRepositoryTaxonomies.type, type));

  return rows.filter((row) => taxonomyMatches(row, value)).map((row) => row.id);
}

async function hydrateSolutions(rows: SolutionItemRow[]) {
  if (rows.length === 0) {
    return [];
  }

  const solutionIds = rows.map((row) => row.id);
  const [taxonomyRows, linkRows, assetRows] = await Promise.all([
    db
      .select({
        solutionId: solutionRepositoryItemTaxonomies.solutionId,
        id: solutionRepositoryTaxonomies.id,
        type: solutionRepositoryTaxonomies.type,
        label: solutionRepositoryTaxonomies.label,
      })
      .from(solutionRepositoryItemTaxonomies)
      .innerJoin(
        solutionRepositoryTaxonomies,
        eq(
          solutionRepositoryItemTaxonomies.taxonomyId,
          solutionRepositoryTaxonomies.id,
        ),
      )
      .where(inArray(solutionRepositoryItemTaxonomies.solutionId, solutionIds))
      .orderBy(
        asc(solutionRepositoryTaxonomies.type),
        asc(solutionRepositoryTaxonomies.label),
      ),
    db
      .select()
      .from(solutionRepositoryLinks)
      .where(inArray(solutionRepositoryLinks.solutionId, solutionIds))
      .orderBy(
        asc(solutionRepositoryLinks.sortOrder),
        asc(solutionRepositoryLinks.label),
      ),
    db
      .select()
      .from(solutionRepositoryAssets)
      .where(inArray(solutionRepositoryAssets.solutionId, solutionIds))
      .orderBy(
        asc(solutionRepositoryAssets.sortOrder),
        asc(solutionRepositoryAssets.filename),
      ),
  ]);

  const taxonomiesBySolution = groupBySolutionId(
    taxonomyRows,
    (row): SolutionRepositoryTaxonomyRecord => ({
      id: row.id,
      type: row.type,
      label: row.label,
    }),
  );
  const linksBySolution = groupBySolutionId(
    linkRows,
    (row): SolutionRepositoryLinkRecord => ({
      label: row.label,
      url: row.url,
    }),
  );
  const assetsBySolution = groupBySolutionId(
    assetRows,
    (row): SolutionRepositoryAssetRecord => ({
      id: row.id,
      kind: row.kind,
      filename: row.filename,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      storageUrl: row.storageUrl,
      attribution: row.attribution,
    }),
  );

  return rows.map((row): SolutionRepositoryItemRecord => {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      summary: row.summary,
      description: row.description,
      implementationNotes: row.implementationNotes,
      costOfImplementation: row.costOfImplementation,
      maintenanceRequirement: row.maintenanceRequirement,
      timeToImplement: row.timeToImplement,
      evidenceLevel: row.evidenceLevel,
      sourceId: row.sourceId,
      sourceRecordId: row.sourceRecordId,
      sourceVersion: row.sourceVersion,
      sourceUpdatedAt: row.sourceUpdatedAt?.toISOString() ?? null,
      license: row.license,
      attribution: row.attribution,
      status: row.status,
      taxonomies: taxonomiesBySolution.get(row.id) ?? [],
      links: linksBySolution.get(row.id) ?? [],
      assets: assetsBySolution.get(row.id) ?? [],
    };
  });
}

function groupBySolutionId<Row extends { solutionId: string }, Value>(
  rows: Row[],
  mapValue: (row: Row) => Value,
) {
  const valuesBySolution = new Map<string, Value[]>();

  for (const row of rows) {
    const values = valuesBySolution.get(row.solutionId) ?? [];
    values.push(mapValue(row));
    valuesBySolution.set(row.solutionId, values);
  }

  return valuesBySolution;
}

function resolveLimit(value: unknown) {
  const limit = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(limit)) {
    return 50;
  }

  return Math.max(1, Math.min(100, Math.trunc(limit)));
}

function taxonomyMatches(row: { id: string; label: string }, value: string) {
  const normalizedValue = normalizeLookupValue(value);
  const normalizedId = normalizeLookupValue(row.id);
  const normalizedLabel = normalizeLookupValue(row.label);
  const normalizedIdWithoutPrefix = normalizeLookupValue(
    row.id.replace(/^hazard-/, "").replace(/^solution-type-/, ""),
  );

  return [normalizedId, normalizedLabel, normalizedIdWithoutPrefix].includes(
    normalizedValue,
  );
}

function normalizeLookupValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function intersectSets(left: Set<string>, right: Set<string>) {
  return new Set([...left].filter((value) => right.has(value)));
}
