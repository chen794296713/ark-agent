/**
 * Postgres connection + Drizzle client.
 *
 * The provided DATABASE_URL carries pooler-only query params (pgbouncer,
 * connection_limit, pool_timeout) that are NOT valid libpq parameters — passing
 * the raw URL to postgres-js would send them as startup options and the server
 * would reject them. So we parse the URL ourselves and map the relevant bits to
 * postgres-js options, and disable prepared statements when behind pgbouncer
 * (transaction pooling mode is incompatible with them).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type PgOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: false | "require";
  prepare: boolean;
  max: number;
  connect_timeout: number;
};

function parsePgUrl(raw: string): PgOptions {
  const u = new URL(raw);
  const sslmode = u.searchParams.get("sslmode");
  const pgbouncer = u.searchParams.get("pgbouncer") === "true";
  const connLimit = u.searchParams.get("connection_limit");
  const connectTimeout = u.searchParams.get("connect_timeout");
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "") || "postgres",
    ssl: sslmode && sslmode !== "disable" ? "require" : false,
    prepare: !pgbouncer,
    max: connLimit ? Number(connLimit) : 10,
    connect_timeout: connectTimeout ? Number(connectTimeout) : 30,
  };
}

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(parsePgUrl(url));
}

// Reuse a single client across HMR reloads in dev to avoid exhausting the pool.
const globalForDb = globalThis as unknown as {
  __arkPg?: ReturnType<typeof postgres>;
};
const client = globalForDb.__arkPg ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.__arkPg = client;

export const db = drizzle(client, { schema });
export { schema };
