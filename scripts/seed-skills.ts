/**
 * Load the Skill Repository's reference data into Postgres — `npm run skills:seed`.
 *
 *   NODE_OPTIONS=--conditions=react-server tsx --env-file=.env scripts/seed-skills.ts
 *   npm run skills:seed -- --dry-run
 *
 * This is reference data, not a demo fixture, so it is unconditional: there is
 * no `SEED_DEMO` gate and no environment where an empty `skills` table is the
 * intended state. Running it twice changes nothing the second time.
 *
 * ---------------------------------------------------------------------------
 * What idempotent means here, and what it deliberately does not overwrite
 * ---------------------------------------------------------------------------
 *
 * Sources upsert on their primary key; every column is refreshed except
 * `sync_cursor`, `sync_lock_until` and the `last_sync_*` family, which belong to
 * whatever run last held the lease. Clobbering a live cursor from a seed would
 * silently re-crawl a registry from page one.
 *
 * Skills upsert on `skills_identity_uniq` — `(source_id, owner_handle, slug)`,
 * not `public_id`. The identity triple is what a row IS; `public_id` is a key we
 * mint FROM it, and conflicting on the mint would let a mint change insert a
 * second row for a skill that already exists.
 *
 * On conflict the update list is deliberately short. `status`, `verified`,
 * `popularity`, `category` and `review_note` are **curation**: an operator who
 * unpublishes a skill must not have it republished by a re-seed, exactly as the
 * sync pipeline may not republish what a human unpublished. The seed owns the
 * catalogue's shape; the humans and the crawler own its state.
 *
 * ---------------------------------------------------------------------------
 * Risk: the prior is scored, never simply trusted
 * ---------------------------------------------------------------------------
 *
 * `catalog.ts` carries a researcher's triage band. This script runs the
 * deterministic rubric (`scoreSkill`) over each row's declared permissions,
 * requirements, licence and tags, and writes `maxBand(prior, derived)` — the
 * rubric may raise a band and may never lower one, the same asymmetry
 * `withReviewerScore` applies to the optional LLM reviewer. The derived
 * `risk_score` and `risk_signals` are persisted too, so the drawer can explain a
 * rating on day one instead of after the first sync. Ten rows currently score
 * stricter than their prior; the run prints them rather than hiding the
 * disagreement.
 *
 * Needs `DATABASE_URL` and nothing else. No `OPENROUTER_API_KEY` — the rubric is
 * arithmetic — and no network: nothing here contacts ClawHub, GitHub or the MCP
 * registry. That is `npm run skills:sync`'s job.
 *
 * Note the file uses an async `main()` rather than top-level `await`: tsx
 * compiles this project's `.ts` as CommonJS, where top-level await is a syntax
 * error.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { skills, skillSources } from "@/lib/db/schema";
import { SEED_SKILLS, type SeedSkill } from "@/lib/skills/catalog";
import { SEED_SKILL_SOURCES } from "@/lib/skills/sources";
import { compatFromList, supportedHarnesses } from "@/lib/skills/harness";
import { isRedistributable, maxBand, scoreSkill } from "@/lib/skills/safety";
import { attributionUrlFor } from "@/lib/skills/sync/normalize";

const ok = (m: string) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => console.log(`  \x1b[31m✗\x1b[0m ${m}`);
const warn = (m: string) => console.log(`  \x1b[33m!\x1b[0m ${m}`);

const hasFlag = (name: string) => process.argv.slice(2).includes(`--${name}`);

/** The ClawHub link-back template, looked up once rather than per row. */
const ATTRIBUTION = new Map(SEED_SKILL_SOURCES.map((s) => [s.id, s.attributionTemplate]));

interface Scored {
  seed: SeedSkill;
  riskLevel: SeedSkill["riskLevel"];
  riskScore: number;
  riskSignals: ReturnType<typeof scoreSkill>["riskSignals"];
  blocked: boolean;
  blockReason: string | null;
  raised: boolean;
}

/**
 * Score one seed row.
 *
 * `body`, `scanner`, `provenance`, `stars` and `downloads` are all absent on
 * purpose — the seed fetched nothing, so passing a value for any of them would
 * be asserting evidence we do not have, and three of the five are worth negative
 * points. `widelyAdopted` is the exception: it is a researched boolean that does
 * not drift, which is the shape the rubric asks for.
 */
function score(seed: SeedSkill): Scored {
  const derived = scoreSkill({
    permissions: seed.permissions,
    requirements: seed.requirements,
    tags: seed.tags,
    license: seed.license,
    format: seed.format,
    install: seed.install,
    publisherVerified: seed.publisherVerified,
    ownerHandle: seed.ownerHandle,
    slug: seed.slug,
    widelyAdopted: seed.widelyAdopted,
  });
  const riskLevel = maxBand(seed.riskLevel, derived.riskLevel);
  return {
    seed,
    riskLevel,
    riskScore: derived.riskScore,
    riskSignals: derived.riskSignals,
    blocked: derived.blocked,
    blockReason: derived.blockReason,
    raised: riskLevel !== seed.riskLevel,
  };
}

async function seedSources(dryRun: boolean): Promise<void> {
  console.log(`\n  sources (${SEED_SKILL_SOURCES.length})`);
  if (dryRun) {
    for (const s of SEED_SKILL_SOURCES) {
      console.log(`    ${s.enabled ? "on " : "off"}  ${s.id.padEnd(18)} ${s.kind}/${s.trust}`);
    }
    return;
  }
  for (const s of SEED_SKILL_SOURCES) {
    await db
      .insert(skillSources)
      .values({
        id: s.id,
        kind: s.kind,
        trust: s.trust,
        name: s.name,
        homepageUrl: s.homepageUrl,
        apiBaseUrl: s.apiBaseUrl,
        attributionTemplate: s.attributionTemplate,
        enabled: s.enabled,
        autoPublish: s.autoPublish,
        rateLimitPerMin: s.rateLimitPerMin,
      })
      .onConflictDoUpdate({
        target: skillSources.id,
        // No `syncCursor`, no `syncLockUntil`, no `lastSync*`: those belong to
        // the run that last held the lease, and resetting a cursor here would
        // silently re-crawl a registry from page one.
        set: {
          kind: s.kind,
          trust: s.trust,
          name: s.name,
          homepageUrl: s.homepageUrl,
          apiBaseUrl: s.apiBaseUrl,
          attributionTemplate: s.attributionTemplate,
          enabled: s.enabled,
          autoPublish: s.autoPublish,
          rateLimitPerMin: s.rateLimitPerMin,
          updatedAt: new Date(),
        },
      });
  }
  ok(`${SEED_SKILL_SOURCES.length} sources upserted`);
}

async function seedSkills(dryRun: boolean): Promise<void> {
  const scored = SEED_SKILLS.map(score);

  const gated = scored.filter((s) => s.blocked);
  for (const g of gated) bad(`hard gate on ${g.seed.publicId}: ${g.blockReason}`);

  const raised = scored.filter((s) => s.raised);
  console.log(`\n  skills (${scored.length})`);
  if (raised.length) {
    warn(`the rubric scores ${raised.length} row(s) stricter than the researched prior:`);
    for (const r of raised) {
      console.log(`      ${r.seed.publicId}: ${r.seed.riskLevel} -> ${r.riskLevel} (${r.riskScore})`);
    }
  }

  if (dryRun) {
    const by = (k: SeedSkill["riskLevel"]) => scored.filter((s) => s.riskLevel === k).length;
    console.log(`    would write  low=${by("low")} medium=${by("medium")} high=${by("high")}`);
    return;
  }

  const now = new Date();
  let written = 0;
  for (const s of scored) {
    const { seed } = s;
    const compat = compatFromList(
      seed.harnesses,
      seed.harnesses.length === 4 ? undefined : "not asserted for this harness",
    );
    // `redistributable` is DERIVED, never seeded, and it is what confines every
    // UNKNOWN / NONE / NOASSERTION row to a registry or git install.
    const redistributable = isRedistributable(seed.license);
    if (seed.install.mode === "inline" && !redistributable) {
      bad(`${seed.publicId} ships inline under "${seed.license}" — skipped, that is redistribution`);
      continue;
    }

    await db
      .insert(skills)
      .values({
        publicId: seed.publicId,
        sourceId: seed.sourceId,
        ownerHandle: seed.ownerHandle,
        slug: seed.slug,
        name: seed.name,
        summary: seed.summary,
        description: "",
        publisherName: seed.publisherName,
        publisherVerified: seed.publisherVerified,
        category: seed.category,
        format: seed.format,
        tags: seed.tags,
        harnessCompat: compat,
        harnesses: supportedHarnesses(compat),
        requirements: seed.requirements ?? {},
        permissions: seed.permissions,
        install: seed.install,
        redistributable,
        license: seed.license,
        licenseVerified: seed.licenseVerified,
        riskLevel: s.riskLevel,
        riskScore: s.riskScore,
        riskSignals: s.riskSignals,
        riskScoredAt: now,
        // The invariant `blocked = (status = 'blocked')` is maintained by writing
        // both in ONE statement; a hard-gated row is never published.
        blocked: s.blocked,
        blockReason: s.blockReason,
        status: s.blocked ? "blocked" : seed.status,
        verified: seed.verified,
        reviewNote: seed.note ?? null,
        popularity: seed.popularity,
        sourceUrl: seed.sourceUrl,
        attributionUrl: attributionUrlFor(
          ATTRIBUTION.get(seed.sourceId) ?? null,
          seed.ownerHandle,
          seed.slug,
        ),
        deprecationNote: seed.deprecationNote ?? null,
        deprecatedAt: seed.status === "deprecated" ? now : null,
        publishedAt: seed.status === "published" && !s.blocked ? now : null,
      })
      .onConflictDoUpdate({
        // The identity triple, not `public_id`: the triple is what the row IS,
        // and conflicting on the mint would let a mint change insert a duplicate.
        target: [skills.sourceId, skills.ownerHandle, skills.slug],
        set: {
          // Shape, which the seed owns.
          name: seed.name,
          summary: seed.summary,
          publisherName: seed.publisherName,
          publisherVerified: seed.publisherVerified,
          format: seed.format,
          tags: seed.tags,
          harnessCompat: compat,
          harnesses: supportedHarnesses(compat),
          requirements: seed.requirements ?? {},
          permissions: seed.permissions,
          install: seed.install,
          redistributable,
          license: seed.license,
          licenseVerified: seed.licenseVerified,
          riskLevel: s.riskLevel,
          riskScore: s.riskScore,
          riskSignals: s.riskSignals,
          riskScoredAt: now,
          blocked: s.blocked,
          blockReason: s.blockReason,
          sourceUrl: seed.sourceUrl,
          deprecationNote: seed.deprecationNote ?? null,
          updatedAt: now,
          // NOT set: status, verified, popularity, category, reviewNote,
          // publishedAt. Those are curation. A re-seed must not republish what an
          // operator unpublished, and must not overwrite a hand-tuned rank.
        },
      });
    written += 1;
  }
  ok(`${written} skills upserted`);
}

async function main() {
  const dryRun = hasFlag("dry-run");
  console.log(`\nArkAgent · skill catalogue seed${dryRun ? "  (dry run — nothing is written)" : ""}`);

  if (!dryRun && !process.env.DATABASE_URL) {
    bad("DATABASE_URL is not set — run with --env-file=.env, or pass --dry-run");
    process.exit(2);
  }

  await seedSources(dryRun);
  await seedSkills(dryRun);

  if (!dryRun) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(skills);
    ok(`catalogue now holds ${count} skill(s)`);
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n✗ skill seed failed:", err);
    process.exit(1);
  });
