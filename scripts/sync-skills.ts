/**
 * Skill-catalogue sync from the command line.
 *
 *   npm run skills:sync -- --source=clawhub --mode=delta
 *   npm run skills:sync -- --source=mcp-registry --dry-run --max-pages=1
 *
 * The same `runSync` the admin route and Vercel Cron call — one implementation,
 * so the path an operator debugs on is the path that runs at 03:10 UTC.
 *
 * Exits non-zero only for a reason a human must act on: an unknown or disabled
 * source, or a bad argument. A held lease exits 0 (another run has it, which is
 * the lock working) and an upstream failure exits 0 with the class printed —
 * the sync did what it could, and a CI job that goes red because ClawHub had a
 * bad minute is a CI job people learn to ignore.
 */
import { runSync } from "@/lib/skills/sync";
import { SYNC_MODES, type SyncMode } from "@/lib/skills/validation";

const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m: string) => console.log(`  \x1b[33m!\x1b[0m ${m}`);

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (hit === undefined) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
}

async function main() {
  console.log("\nArkAgent · skill sync\n");

  const source = arg("source");
  if (!source) {
    bad("--source=<id> is required (e.g. --source=clawhub)");
    process.exit(2);
  }

  const rawMode = arg("mode") ?? "delta";
  if (!(SYNC_MODES as readonly string[]).includes(rawMode)) {
    bad(`--mode must be one of ${SYNC_MODES.join(", ")}`);
    process.exit(2);
  }
  const mode = rawMode as SyncMode;

  const rawPages = arg("max-pages");
  const maxPages = rawPages ? Number(rawPages) : 5;
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 50) {
    bad("--max-pages must be an integer in [1, 50]");
    process.exit(2);
  }

  const dryRun = arg("dry-run") !== undefined;
  const cursor = arg("cursor") || undefined;

  console.log(`  source   : ${source}`);
  console.log(`  mode     : ${mode}${dryRun ? "  (dry run — nothing is written)" : ""}`);
  console.log(`  maxPages : ${maxPages}\n`);

  const outcome = await runSync(source, { mode, maxPages, cursor, dryRun });

  if (!outcome.ok) {
    if (outcome.reason === "locked") {
      warn("another run holds the lease; nothing to do");
      process.exit(0);
    }
    bad(outcome.reason === "disabled" ? "source is disabled" : "unknown source");
    if (outcome.reason === "unknown_source") {
      warn("`skill_sources` may simply be empty — seed it before syncing");
    }
    process.exit(1);
  }

  const { stats, cursor: next, done, error } = outcome.result;
  ok(
    `fetched ${stats.fetched} · created ${stats.created} · updated ${stats.updated} · ` +
      `skipped ${stats.skipped} · blocked ${stats.blocked} · ${stats.durationMs}ms`,
  );
  if (error) warn(`upstream: ${error}`);
  if (!done) warn(`incomplete — resume with --cursor=${next ?? ""}`);
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  bad(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
