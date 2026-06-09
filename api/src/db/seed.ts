import { existsSync, readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { closeDb, db } from "./client.js";
import { countryGeoConfig, geographies } from "./schema.js";

type GeographySeedFile = {
  countryGeoConfig?: (typeof countryGeoConfig.$inferInsert)[];
  geographies?: (typeof geographies.$inferInsert)[];
};

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
