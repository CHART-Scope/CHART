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
  process.env.DATABASE_URL ?? "postgres://chart:chart@127.0.0.1:5432/chart_cms";

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
