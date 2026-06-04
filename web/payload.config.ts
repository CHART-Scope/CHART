import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig } from "payload";

import { ContentItems } from "./src/collections/ContentItems";
import { Media } from "./src/collections/Media";
import { Submissions } from "./src/collections/Submissions";
import { Users } from "./src/collections/Users";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const chartWebOrigin = process.env.CHART_WEB_ORIGIN ?? "http://127.0.0.1:3100";
const postgresConnectionString =
  process.env.DATABASE_URL ?? "postgres://chart:chart@127.0.0.1:5432/chart";
const payloadTables = [
  "users",
  "users_sessions",
  "media",
  "content_items",
  "content_items_case_studies",
  "content_items_climate_hazards",
  "content_items_solution_types",
  "content_items_useful_links",
  "_content_items_v",
  "_content_items_v_version_case_studies",
  "_content_items_v_version_climate_hazards",
  "_content_items_v_version_solution_types",
  "_content_items_v_version_useful_links",
  "submissions",
  "submissions_tags",
  "payload_kv",
  "payload_locked_documents",
  "payload_locked_documents_rels",
  "payload_preferences",
  "payload_preferences_rels",
  "payload_migrations",
];

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET ?? "chart-dev-secret",
  serverURL: process.env.CHART_CMS_SERVER_URL ?? "http://127.0.0.1:3100",
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname, "./src/app/(payload)"),
      importMapFile: path.resolve(dirname, "./src/app/(payload)/admin/importMap.ts"),
    },
  },
  cors: [chartWebOrigin, "http://localhost:3100"],
  csrf: [chartWebOrigin, "http://localhost:3100"],
  db: postgresAdapter({
    pool: {
      connectionString: postgresConnectionString,
    },
    tablesFilter: payloadTables,
  }),
  collections: [Users, Media, ContentItems, Submissions],
  routes: {
    admin: "/admin",
    api: "/api",
  },
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
});
