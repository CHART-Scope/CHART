import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://chart:chart@127.0.0.1:5432/chart";

type DatabaseClient = ReturnType<typeof postgres>;
type Database = ReturnType<typeof drizzle>;

let client: DatabaseClient | undefined;
let database: Database | undefined;

export const db = new Proxy({} as Database, {
  get(_target, property, receiver) {
    return Reflect.get(getDb(), property, receiver);
  },
}) as Database;

function getDb() {
  if (!client) {
    client = postgres(databaseUrl, { max: 5 });
    database = drizzle(client);
  }

  return database as Database;
}

export async function closeDb() {
  if (!client) {
    return;
  }

  await client.end();
  client = undefined;
  database = undefined;
}
