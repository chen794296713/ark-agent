/**
 * Billing window resolution.
 *
 * This replaced `getBillDatasets()`, which handed every workspace the same
 * invented 18,420 credits and an estimate for four seats it had never bought.
 * The windows below are what decides which real rows get summed, so an
 * off-by-one here silently mis-bills a range.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWindow } from "../lib/services/billing";

const NOW = new Date("2026-08-29T12:00:00Z");
const day = (d: Date) => d.toISOString().slice(0, 10);

/** A workspace whose cycle ends in three days, created long ago. */
const ws = {
  cycleResetsAt: new Date("2026-09-01T00:00:00Z"),
  createdAt: new Date("2025-01-01T00:00:00Z"),
};

test("the current cycle runs from one cycle before the reset date to now", () => {
  const w = resolveWindow("cycle", ws, NOW);
  assert.equal(day(w.from), "2026-08-02"); // 2026-09-01 minus 30 days
  assert.equal(w.to.toISOString(), NOW.toISOString());
});

test("the previous cycle abuts the current one exactly, with no gap or overlap", () => {
  const cycle = resolveWindow("cycle", ws, NOW);
  const last = resolveWindow("last", ws, NOW);
  assert.equal(day(last.from), "2026-07-03");
  // The half-open windows must meet: a credit spent at the boundary belongs to
  // exactly one of them.
  assert.equal(last.to.getTime(), cycle.from.getTime());
});

test("90 days is 90 days back from now", () => {
  const w = resolveWindow("d90", ws, NOW);
  assert.equal(day(w.from), "2026-05-31");
  assert.equal(w.to.toISOString(), NOW.toISOString());
});

test("a custom range includes its final day", () => {
  // The picker's `to` is an inclusive day; the query is half-open, so the
  // window has to end at the START of the following day or 08-10 is lost.
  const w = resolveWindow("custom", ws, NOW, { from: "2026-08-01", to: "2026-08-10" });
  assert.equal(w.from.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(w.to.toISOString(), "2026-08-11T00:00:00.000Z");
});

test("a backwards or unparseable custom range falls back to the cycle", () => {
  const cycle = resolveWindow("cycle", ws, NOW);
  for (const bad of [
    { from: "2026-08-10", to: "2026-08-01" },
    { from: "not-a-date", to: "2026-08-01" },
    { from: "2026-08-01", to: "2026-08-01" }, // same day is fine, not backwards
  ]) {
    const w = resolveWindow("custom", ws, NOW, bad);
    assert.ok(w.to > w.from, `${JSON.stringify(bad)} produced an empty window`);
  }
  const backwards = resolveWindow("custom", ws, NOW, { from: "2026-08-10", to: "2026-08-01" });
  assert.equal(backwards.from.getTime(), cycle.from.getTime());
});

test("a workspace that has never been billed charts from its own creation", () => {
  // Not from a calendar month it predates: a two-day-old account must not be
  // charted against a window that starts before it existed.
  const fresh = { cycleResetsAt: null, createdAt: new Date("2026-08-27T09:00:00Z") };
  const w = resolveWindow("cycle", fresh, NOW);
  assert.equal(w.from.toISOString(), "2026-08-27T09:00:00.000Z");
});

test("an older workspace with no reset date charts from the start of the month", () => {
  const older = { cycleResetsAt: null, createdAt: new Date("2025-03-01T00:00:00Z") };
  const w = resolveWindow("cycle", older, NOW);
  assert.equal(w.from.toISOString(), "2026-08-01T00:00:00.000Z");
});

test("a stale reset date does not chart a window that already ended", () => {
  // If the cycle-reset job stops running, `cycle_resets_at` drifts into the
  // past. Deriving the window from it would show a month-old range and read as
  // "no usage this cycle".
  const stale = {
    cycleResetsAt: new Date("2026-06-01T00:00:00Z"),
    createdAt: new Date("2025-01-01T00:00:00Z"),
  };
  const w = resolveWindow("cycle", stale, NOW);
  assert.equal(w.from.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.ok(w.from < w.to);
});
