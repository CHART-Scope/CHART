import { existsSync, readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { closeDb, db } from "./client.js";
import { countryGeoConfig, dataSources, geographies, hazards } from "./schema.js";

type GeographySeedFile = {
  countryGeoConfig?: (typeof countryGeoConfig.$inferInsert)[];
  geographies?: (typeof geographies.$inferInsert)[];
};

const hazardSeed: (typeof hazards.$inferInsert)[] = [
  { id: "hazard-storm", label: "Storm", sortOrder: 10 },
  { id: "hazard-extreme-heat", label: "Extreme heat", sortOrder: 20 },
  {
    id: "hazard-increased-temperature",
    label: "Increased temperature",
    sortOrder: 30,
  },
  { id: "hazard-earthquake", label: "Earthquake", sortOrder: 40 },
  { id: "hazard-flood", label: "Flood", sortOrder: 50 },
  { id: "hazard-sea-level-rise", label: "Sea level rise", sortOrder: 60 },
  { id: "hazard-cold-wave", label: "Cold wave", sortOrder: 70 },
  { id: "hazard-drought", label: "Drought", sortOrder: 80 },
  { id: "hazard-wildfire", label: "Wildfire", sortOrder: 90 },
  { id: "hazard-increased-co2-levels", label: "Increased CO2 levels", sortOrder: 100 },
  { id: "hazard-landslide", label: "Landslide", sortOrder: 110 },
  { id: "hazard-tsunami", label: "Tsunami", sortOrder: 120 },
  { id: "hazard-volcano", label: "Volcano", sortOrder: 130 },
  { id: "hazard-cyclone", label: "Cyclone", sortOrder: 140 },
];

const dataSourceSeed: (typeof dataSources.$inferInsert)[] = [
  {
    id: "health-dhis2",
    kind: "health",
    provider: "DHIS2",
    name: "DHIS2 health data",
    baseUrl: process.env.DHIS2_BASE_URL?.replace(/\/+$/, "") || null,
    authMode: process.env.DHIS2_AUTH_MODE || "pat",
    enabled: true,
  },
  {
    id: "chart-solution-repository",
    kind: "solutions",
    provider: "CHART",
    name: "CHART solution repository",
    baseUrl: process.env.CHART_SOLUTION_REPOSITORY_URL?.replace(/\/+$/, "") || null,
    authMode: "public_snapshot",
    enabled: true,
  },
];

try {
  const geographySeed = readGeographySeedFile(process.env.CHART_GEOGRAPHY_SEED_FILE);

  await db.transaction(async (tx) => {
    if (geographySeed.countryGeoConfig.length > 0) {
      await tx
        .insert(countryGeoConfig)
        .values(geographySeed.countryGeoConfig)
        .onConflictDoUpdate({
          target: [countryGeoConfig.countryCode, countryGeoConfig.levelKey],
          set: {
            levelLabel: sql`excluded.level_label`,
            enabled: sql`excluded.enabled`,
            sortOrder: sql`excluded.sort_order`,
            updatedAt: sql`now()`,
          },
        });
    }

    if (geographySeed.geographies.length > 0) {
      await tx
        .insert(geographies)
        .values(geographySeed.geographies)
        .onConflictDoUpdate({
          target: geographies.id,
          set: {
            countryCode: sql`excluded.country_code`,
            level: sql`excluded.level`,
            levelLabel: sql`excluded.level_label`,
            name: sql`excluded.name`,
            parentId: sql`excluded.parent_id`,
            externalCode: sql`excluded.external_code`,
            path: sql`excluded.path`,
            sortOrder: sql`excluded.sort_order`,
            updatedAt: sql`now()`,
          },
        });
    }

    await tx
      .insert(hazards)
      .values(hazardSeed)
      .onConflictDoUpdate({
        target: hazards.id,
        set: {
          label: sql`excluded.label`,
          active: sql`excluded.active`,
          sortOrder: sql`excluded.sort_order`,
          updatedAt: sql`now()`,
        },
      });

    await tx
      .insert(dataSources)
      .values(dataSourceSeed)
      .onConflictDoUpdate({
        target: dataSources.id,
        set: {
          kind: sql`excluded.kind`,
          provider: sql`excluded.provider`,
          name: sql`excluded.name`,
          baseUrl: sql`excluded.base_url`,
          authMode: sql`excluded.auth_mode`,
          enabled: sql`excluded.enabled`,
          updatedAt: sql`now()`,
        },
      });
  });
} finally {
  await closeDb();
}

function readGeographySeedFile(seedFilePath: string | undefined) {
  if (!seedFilePath) {
    return { countryGeoConfig: [], geographies: [] };
  }

  if (!existsSync(seedFilePath)) {
    throw new Error(`Geography seed file does not exist: ${seedFilePath}`);
  }

  const parsed = JSON.parse(readFileSync(seedFilePath, "utf8")) as GeographySeedFile;

  return {
    countryGeoConfig: parsed.countryGeoConfig ?? [],
    geographies: parsed.geographies ?? [],
  };
}
