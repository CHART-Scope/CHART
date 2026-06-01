import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { countryGeoConfig, geographies } from "./schema.js";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://chart:chart@127.0.0.1:5432/chart";

const client = postgres(databaseUrl, { max: 1 });
const db = drizzle(client);

const countryLevelConfig: (typeof countryGeoConfig.$inferInsert)[] = [
  { countryCode: "IN", levelKey: "country", levelLabel: "country", sortOrder: 0 },
  { countryCode: "IN", levelKey: "geo_level_1", levelLabel: "state", sortOrder: 1 },
  {
    countryCode: "IN",
    levelKey: "geo_level_2",
    levelLabel: "district",
    sortOrder: 2,
  },
  { countryCode: "IN", levelKey: "geo_level_3", levelLabel: "block", sortOrder: 3 },
  { countryCode: "KE", levelKey: "country", levelLabel: "country", sortOrder: 0 },
  { countryCode: "KE", levelKey: "geo_level_1", levelLabel: "county", sortOrder: 1 },
  {
    countryCode: "KE",
    levelKey: "geo_level_2",
    levelLabel: "sub-county",
    sortOrder: 2,
  },
];

const geographySeed: (typeof geographies.$inferInsert)[] = [
  {
    id: "geo-in",
    countryCode: "IN",
    level: "country",
    levelLabel: "country",
    name: "India",
    parentId: null,
    externalCode: "IN",
    path: "/india",
    sortOrder: 0,
  },
  {
    id: "geo-in-mp",
    countryCode: "IN",
    level: "geo_level_1",
    levelLabel: "state",
    name: "Madhya Pradesh",
    parentId: "geo-in",
    externalCode: "IN-MP",
    path: "/india/madhya-pradesh",
    sortOrder: 10,
  },
  {
    id: "geo-in-mp-gwalior",
    countryCode: "IN",
    level: "geo_level_2",
    levelLabel: "district",
    name: "Gwalior",
    parentId: "geo-in-mp",
    externalCode: null,
    path: "/india/madhya-pradesh/gwalior",
    sortOrder: 10,
  },
  {
    id: "geo-ke",
    countryCode: "KE",
    level: "country",
    levelLabel: "country",
    name: "Kenya",
    parentId: null,
    externalCode: "KE",
    path: "/kenya",
    sortOrder: 0,
  },
  {
    id: "geo-ke-kajiado",
    countryCode: "KE",
    level: "geo_level_1",
    levelLabel: "county",
    name: "Kajiado",
    parentId: "geo-ke",
    externalCode: null,
    path: "/kenya/kajiado",
    sortOrder: 10,
  },
  {
    id: "geo-ke-kajiado-loitokitok",
    countryCode: "KE",
    level: "geo_level_2",
    levelLabel: "sub-county",
    name: "Loitokitok",
    parentId: "geo-ke-kajiado",
    externalCode: null,
    path: "/kenya/kajiado/loitokitok",
    sortOrder: 10,
  },
];

try {
  await db.transaction(async (tx) => {
    await tx
      .insert(countryGeoConfig)
      .values(countryLevelConfig)
      .onConflictDoUpdate({
        target: [countryGeoConfig.countryCode, countryGeoConfig.levelKey],
        set: {
          levelLabel: sql`excluded.level_label`,
          enabled: sql`excluded.enabled`,
          sortOrder: sql`excluded.sort_order`,
          updatedAt: sql`now()`,
        },
      });

    await tx
      .insert(geographies)
      .values(geographySeed)
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
  });
} finally {
  await client.end();
}
