import { existsSync, readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { closeDb, db } from "./client.js";
import {
  countryGeoConfig,
  geographies,
  solutionRepositoryTaxonomies,
} from "./schema.js";
import { importSolutionRepositorySeedFile } from "../modules/solution-repository/seed.js";

type GeographySeedFile = {
  countryGeoConfig?: (typeof countryGeoConfig.$inferInsert)[];
  geographies?: (typeof geographies.$inferInsert)[];
};

const solutionRepositoryTaxonomySeed: (typeof solutionRepositoryTaxonomies.$inferInsert)[] =
  [
    { id: "hazard-storm", type: "hazard", label: "Storm" },
    { id: "hazard-extreme-heat", type: "hazard", label: "Extreme heat" },
    {
      id: "hazard-increased-temperature",
      type: "hazard",
      label: "Increased temperature",
    },
    { id: "hazard-earthquake", type: "hazard", label: "Earthquake" },
    { id: "hazard-flood", type: "hazard", label: "Flood" },
    { id: "hazard-sea-level-rise", type: "hazard", label: "Sea level rise" },
    { id: "hazard-cold-wave", type: "hazard", label: "Cold wave" },
    { id: "hazard-drought", type: "hazard", label: "Drought" },
    { id: "hazard-wildfire", type: "hazard", label: "Wildfire" },
    {
      id: "hazard-increased-co2-levels",
      type: "hazard",
      label: "Increased CO2 levels",
    },
    { id: "hazard-landslide", type: "hazard", label: "Landslide" },
    { id: "hazard-tsunami", type: "hazard", label: "Tsunami" },
    { id: "hazard-volcano", type: "hazard", label: "Volcano" },
    { id: "hazard-cyclone", type: "hazard", label: "Cyclone" },
    { id: "solution-type-wash", type: "solution_type", label: "WASH" },
    {
      id: "solution-type-health-workforce",
      type: "solution_type",
      label: "Health workforce",
    },
    { id: "solution-type-energy", type: "solution_type", label: "Energy" },
    {
      id: "solution-type-infrastructure",
      type: "solution_type",
      label: "Infrastructure",
    },
    {
      id: "solution-type-products-technology",
      type: "solution_type",
      label: "Products and technology",
    },
    {
      id: "solution-type-service-delivery",
      type: "solution_type",
      label: "Service delivery",
    },
    { id: "solution-type-communities", type: "solution_type", label: "Communities" },
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
      .insert(solutionRepositoryTaxonomies)
      .values(solutionRepositoryTaxonomySeed)
      .onConflictDoUpdate({
        target: solutionRepositoryTaxonomies.id,
        set: {
          type: sql`excluded.type`,
          label: sql`excluded.label`,
          updatedAt: sql`now()`,
        },
      });
  });

  const solutionSeedResult = await importSolutionRepositorySeedFile();

  if (solutionSeedResult.status === "imported") {
    console.log(
      `Imported ${solutionSeedResult.importedItems} solution repository items from ${solutionSeedResult.sourcePath}.`,
    );
  }
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
