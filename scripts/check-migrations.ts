/**
 * Migration replay check — `npm run db:check`.
 *
 * Replays the migration set into throwaway databases and reports the first
 * statement that fails. It runs TWO passes, because they exercise genuinely
 * different Postgres behaviour:
 *
 *   1. FRESH — every file, in journal order, in one transaction, from empty.
 *      This is what CI and a new developer do.
 *   2. INCREMENTAL — commit files 0..K, then run K+1..N in ONE transaction, for
 *      the K values that can expose the hazard (or every K with `--exhaustive`).
 *      This is what a deployment does, and it is the pass that catches it.
 *
 * Why two passes, and why the second is the important one
 * -------------------------------------------------------
 * `drizzle-orm`'s migrator wraps all PENDING migrations in a single
 * `session.transaction()` (node_modules/drizzle-orm/pg-core/dialect.js), and
 * Postgres refuses to *use* an enum value that was added in the current
 * transaction — `unsafe use of new value "x" of enum type e`. Adding the value
 * is fine; a DEFAULT clause, an INSERT, a comparison or a CHECK that names it
 * is not. All four were verified against this project's Postgres 18.
 *
 * The exception is what makes this subtle: **if the enum type itself was
 * created in the same transaction, using a newly added value is allowed.** On a
 * fresh replay every type is created in that one transaction, so the hazard
 * cannot fire — pass 1 is green no matter how the files are arranged. It is the
 * INCREMENTAL path, against a database where the type was committed long ago,
 * that fails. That is production, not CI.
 *
 * So: enum-value additions belong in their own migration file containing
 * nothing else, and pass 2 is what proves it. See docs/TASK_PLAN_V2.md §2.1.
 *
 * Requires CREATEDB on the connecting role.
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";

const SCRATCH_DB = "ark_migration_check";

/** A remote Postgres drops idle connections; one retry covers the usual blip. */
async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!/ETIMEDOUT|ECONNRESET|Connection terminated/i.test(String(e))) throw e;
    console.warn(`  … ${what} hit a connection blip, retrying once`);
    return await fn();
  }
}

interface Failure {
  pass: string;
  file: string;
  statement: string;
  error: string;
}

/** Split a migration file into statements, dropping comment-only chunks. */
function statements(body: string): string[] {
  return body
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s && !s.split("\n").every((line) => line.trim().startsWith("--")));
}

function scratchUrl(base: string): string {
  const u = new URL(base);
  u.pathname = `/${SCRATCH_DB}`;
  return u.toString();
}

async function recreateScratch(base: string): Promise<void> {
  const admin = postgres(base, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${SCRATCH_DB}`);
    await admin.unsafe(`create database ${SCRATCH_DB}`);
  } finally {
    await admin.end();
  }
}

async function dropScratch(base: string): Promise<void> {
  const admin = postgres(base, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`drop database if exists ${SCRATCH_DB}`);
  } finally {
    await admin.end();
  }
}

/**
 * Apply `files` to a fresh scratch database: the first `committedCount` one
 * transaction each (so they are genuinely committed, as a deployed database's
 * history is), and the remainder together in one transaction — the way the
 * migrator runs a pending batch.
 */
async function replay(
  base: string,
  dir: string,
  files: string[],
  committedCount: number,
  pass: string,
): Promise<Failure | null> {
  await withRetry(`recreating ${SCRATCH_DB}`, () => recreateScratch(base));
  const sql = postgres(scratchUrl(base), { max: 1, onnotice: () => {}, connect_timeout: 30 });
  let failure: Failure | null = null;

  const run = async (
    exec: (s: string) => Promise<unknown>,
    file: string,
  ): Promise<void> => {
    for (const statement of statements(readFileSync(`${dir}/${file}`, "utf8"))) {
      try {
        await exec(statement);
      } catch (e) {
        failure ??= { pass, file, statement: statement.slice(0, 220), error: String(e).slice(0, 300) };
        throw e;
      }
    }
  };

  try {
    for (const file of files.slice(0, committedCount)) {
      await sql.begin(async (tx) => run((s) => tx.unsafe(s), file));
    }
    const pending = files.slice(committedCount);
    if (pending.length) {
      await sql.begin(async (tx) => {
        for (const file of pending) await run((s) => tx.unsafe(s), file);
      });
    }
  } catch {
    /* captured in `failure` */
  } finally {
    await sql.end();
  }
  return failure;
}

function report(f: Failure): void {
  console.error(`\n✗ ${f.pass} FAILED in ${f.file}\n\n  ${f.statement}\n\n  ${f.error}\n`);
  if (/unsafe use of new value|invalid input value for enum/i.test(f.error)) {
    console.error(
      "  This is the enum-in-one-transaction hazard. The value is added and then USED\n" +
        "  inside the same pending batch, against a database where the type already\n" +
        "  existed. Move every `ALTER TYPE … ADD VALUE` into its own earlier migration\n" +
        "  file containing nothing else, so it is committed before anything names it.\n" +
        "  Note this passes a fresh replay and fails only on an existing database —\n" +
        "  i.e. it breaks production, not CI. See docs/TASK_PLAN_V2.md §2.1.\n",
    );
  }
}

async function main() {
  const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const dir = "lib/db/migrations";
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (!files.length) {
    console.error(`No migrations found in ${dir}.`);
    process.exit(1);
  }

  try {
    // Pass 1 — fresh, everything pending.
    const fresh = await replay(url, dir, files, 0, "fresh replay");
    if (fresh) {
      report(fresh);
      process.exit(1);
    }
    console.log(`✓ fresh replay — ${files.length} migrations in one transaction`);

    // Pass 2 — the deployed states that can actually expose the enum hazard.
    //
    // A hazard exists for deployed state K iff some file in (K, N] adds a value
    // to a type created in [0, K]. Every enum type is created in 0000, so K = 1
    // is the strictest case: the types are committed and every later file is in
    // one pending batch. K = N-1 is the ordinary deploy — one new migration
    // against a fully migrated database — and is checked because it is the case
    // that actually runs on release day.
    //
    // Exhaustive K costs one database rebuild per migration, which is minutes
    // against a remote Postgres and rarely finds anything K = 1 does not. Pass
    // `--exhaustive` when changing the migration layout.
    const exhaustive = process.argv.includes("--exhaustive");
    const states = exhaustive
      ? Array.from({ length: files.length }, (_, i) => i + 1)
      : [...new Set([1, Math.max(1, files.length - 1)])];

    for (const k of states) {
      const f = await replay(url, dir, files, k, `incremental replay (${k} committed)`);
      if (f) {
        report(f);
        process.exit(1);
      }
    }
    console.log(
      `✓ incremental replay — deployed state${states.length > 1 ? "s" : ""} ${states.join(", ")} of ${files.length} upgrade cleanly`,
    );
  } finally {
    await dropScratch(url);
  }
}

main().catch((e) => {
  console.error(String(e).slice(0, 400));
  process.exit(1);
});
