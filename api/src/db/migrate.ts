import { migrate } from "drizzle-orm/postgres-js/migrator";

import { closeDb, db } from "./client.js";

async function runMigrations() {
  await migrate(db, { migrationsFolder: "./drizzle" });
}

runMigrations()
  .then(async () => {
    await closeDb();
    console.log("Database migrations applied.");
  })
  .catch(async (error: unknown) => {
    await closeDb();
    console.error(error);
    process.exit(1);
  });
