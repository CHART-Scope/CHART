import path from "node:path";
import { fileURLToPath } from "node:url";

import { postgresAdapter } from "@payloadcms/db-postgres";
import { buildConfig } from "payload";

import { ContentItems } from "./src/collections/ContentItems";
import { Hazards } from "./src/collections/Hazards";
import { HealthImplications } from "./src/collections/HealthImplications";
import { Media } from "./src/collections/Media";
import { Submissions } from "./src/collections/Submissions";
import { Users } from "./src/collections/Users";

const dirname = path.dirname(fileURLToPath(import.meta.url));

const readConfigValue = (name: string, developmentValue: string) => {
  const value = process.env[name];

  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} must be configured in production.`);
  }

  return developmentValue;
};

const chartWebOrigin = readConfigValue("CHART_WEB_ORIGIN", "http://127.0.0.1:3100");
const payloadSecret = readConfigValue("PAYLOAD_SECRET", "chart-repository-dev-secret");
const postgresConnectionString = readConfigValue(
  "REPOSITORY_DATABASE_URL",
  "postgres://chart_repository:chart_repository@127.0.0.1:5433/chart_repository",
);
const serverUrl = readConfigValue(
  "CHART_REPOSITORY_SERVER_URL",
  "http://127.0.0.1:3300",
);

export default buildConfig({
  secret: payloadSecret,
  serverURL: serverUrl,
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: " - CHART Repository",
    },
    theme: "light",
    importMap: {
      baseDir: path.resolve(dirname, "./src/app/(payload)"),
      importMapFile: path.resolve(dirname, "./src/app/(payload)/admin/importMap.ts"),
    },
  },
  cors: [chartWebOrigin, "http://localhost:3100", "http://127.0.0.1:3300"],
  csrf: [chartWebOrigin, "http://localhost:3100", "http://127.0.0.1:3300"],
  db: postgresAdapter({
    pool: {
      connectionString: postgresConnectionString,
    },
  }),
  collections: [Users, Media, Hazards, HealthImplications, ContentItems, Submissions],
  routes: {
    admin: "/admin",
    api: "/api",
  },
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
});
