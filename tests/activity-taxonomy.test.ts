/**
 * The activity taxonomy is a CLOSED vocabulary whose severity is derived, and
 * every property that makes it closed is asserted here.
 *
 * Two failure classes drive this suite:
 *
 *  1. A value added to a `pgEnum` and not to the client-safe mirror. That is
 *     not a type error anywhere — the mirror compiles fine — and it surfaces in
 *     production as `22P02 invalid input value for enum` from a filter, i.e. a
 *     500 with the enum's full value list in the message.
 *  2. A code added to the registry with no dictionary entry. That renders the
 *     raw code in the middle of a localised feed, which reads as a broken agent
 *     rather than a missing string.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_CODES,
  ACTIVITY_TAGS,
  AGENT_STATUSES,
  RUN_STATUSES,
  RUN_TRIGGERS,
  SEVERITIES,
  STEP_PHASES,
  VARIABLE_CODES,
  constantCodes,
  isActivityCode,
  normalizeCode,
  predicateMatches,
  runStatusesFor,
  severityBand,
  severityOf,
  severityOfRunStatus,
  variableCodePredicates,
  type ActivityCode,
  type Severity,
} from "../lib/activity/types";
import { activity, activityLine, interpolate } from "../lib/i18n/activity";
import {
  activityTagEnum,
  agentStatusEnum,
  runStatusEnum,
  runStepPhaseEnum,
  runTriggerEnum,
} from "../lib/db/schema";
import { LANGS } from "../lib/i18n";

// ---------------------------------------------------------------------------
// The enum mirrors
// ---------------------------------------------------------------------------

test("every client-safe enum mirror matches its pgEnum exactly", () => {
  assert.deepEqual([...RUN_TRIGGERS], [...runTriggerEnum.enumValues]);
  assert.deepEqual([...RUN_STATUSES], [...runStatusEnum.enumValues]);
  assert.deepEqual([...STEP_PHASES], [...runStepPhaseEnum.enumValues]);
  assert.deepEqual([...ACTIVITY_TAGS], [...activityTagEnum.enumValues]);
  assert.deepEqual([...AGENT_STATUSES], [...agentStatusEnum.enumValues]);
});

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

test("the code registry is the documented 24, with no duplicates", () => {
  assert.equal(ACTIVITY_CODES.length, 24);
  assert.equal(new Set(ACTIVITY_CODES).size, 24);
  // `custom` is the escape hatch and must never be dropped: an unknown code is
  // coerced to it, so removing it makes an unknown code unrenderable.
  assert.ok(ACTIVITY_CODES.includes("custom"));
});

test("an unknown code is coerced to `custom`, and a missing code stays null", () => {
  assert.equal(normalizeCode("run.started"), "run.started");
  // Coerced, not dropped: the row still renders, badged as agent-written.
  assert.equal(normalizeCode("agent.invented.this"), "custom");
  assert.equal(normalizeCode(null), null);
  assert.equal(normalizeCode(undefined), null);
  // '' is what a NOT NULL text column holds when nothing set it.
  assert.equal(normalizeCode(""), null);
  assert.ok(!isActivityCode("agent.invented.this"));
});

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

test("severityOf is total over the registry and returns a real severity", () => {
  for (const code of ACTIVITY_CODES) {
    const sev = severityOf(code, {});
    assert.ok((SEVERITIES as readonly string[]).includes(sev), `${code} -> ${sev}`);
  }
});

test("a row with no code is info, and is matched by no other band", () => {
  // Pre-v2 and legacy ArkAgent bookkeeping rows carry only `text`. Guessing a
  // severity for them from `tag` would put unaudited legacy text into an
  // incident view.
  assert.equal(severityOf(null, {}), "info");
  assert.equal(severityOf(null, { severity: "error" }), "info");
});

test("exactly three codes vary with params; the other 21 ignore params entirely", () => {
  const noisy = {
    status: "failed",
    to: "error",
    severity: "warning",
    reason: "whatever",
    retryable: "true",
  };
  const varied: ActivityCode[] = [];
  for (const code of ACTIVITY_CODES) {
    if (severityOf(code, {}) !== severityOf(code, noisy)) varied.push(code);
  }
  assert.deepEqual(varied.sort(), [...VARIABLE_CODES].sort());
});

test("the three variable codes grade on the field the registry names", () => {
  assert.equal(severityOf("run.finished", { status: "succeeded" }), "info");
  assert.equal(severityOf("run.finished", { status: "cancelled" }), "notice");
  assert.equal(severityOf("run.finished", { status: "failed" }), "error");
  assert.equal(severityOf("run.finished", { status: "timeout" }), "error");
  // A missing or unrecognised status is not an incident.
  assert.equal(severityOf("run.finished", {}), "info");

  assert.equal(severityOf("status.changed", { to: "error" }), "error");
  assert.equal(severityOf("status.changed", { to: "paused" }), "info");

  assert.equal(severityOf("error.raised", { severity: "warning" }), "warning");
  assert.equal(severityOf("error.raised", { severity: "error" }), "error");
  // `fatal` maps to error, and — the load-bearing one — an ABSENT severity
  // defaults to error. Defaulting it to warning would hide unlabelled failures
  // from the incident view.
  assert.equal(severityOf("error.raised", { severity: "fatal" }), "error");
  assert.equal(severityOf("error.raised", {}), "error");
});

test("a denial is a notice, not a warning: the policy worked", () => {
  assert.equal(severityOf("tool.denied", { toolName: "x", denyReason: "approval_required" }), "notice");
  assert.equal(severityOf("schedule.skipped", {}), "notice");
  assert.equal(severityOf("improvement.proposed", {}), "notice");
});

// ---------------------------------------------------------------------------
// The band predicates — the server-side filter
// ---------------------------------------------------------------------------

/** Every param value the three variable codes can plausibly carry, plus absence. */
const PARAM_CASES: Record<string, string[]> = {
  "run.finished": ["succeeded", "failed", "timeout", "cancelled", "queued", "", "made_up"],
  "status.changed": [...AGENT_STATUSES, "", "made_up"],
  "error.raised": ["warning", "error", "fatal", "", "made_up"],
};
const PARAM_KEY: Record<string, string> = {
  "run.finished": "status",
  "status.changed": "to",
  "error.raised": "severity",
};

test("the four bands partition every (code, params) pair exactly once", () => {
  // This is the property the whole filter rests on: a row must appear under
  // exactly one severity chip. A gap silently hides rows; an overlap
  // double-counts them across two tabs.
  const bands = SEVERITIES.map((s) => ({
    sev: s,
    codes: new Set<string>(constantCodes(s)),
    preds: variableCodePredicates(s),
  }));

  for (const code of ACTIVITY_CODES) {
    const isVariable = (VARIABLE_CODES as readonly string[]).includes(code);
    const cases = isVariable
      ? PARAM_CASES[code].map((v) => ({ [PARAM_KEY[code]]: v }))
      : [{}];
    for (const params of cases) {
      const matched = bands.filter((b) =>
        isVariable
          ? b.preds.some((p) => p.code === code && predicateMatches(p, params))
          : b.codes.has(code),
      );
      assert.equal(
        matched.length,
        1,
        `${code} ${JSON.stringify(params)} matched ${matched.length} bands: ${matched.map((m) => m.sev)}`,
      );
      // …and the band it lands in is the one severityOf reports, so the SQL
      // filter and the row's own glyph can never disagree.
      assert.equal(matched[0].sev, severityOf(code, params));
    }
  }
});

test("constantCodes and variableCodePredicates together cover the registry", () => {
  const seen = new Set<string>();
  for (const s of SEVERITIES) {
    for (const c of constantCodes(s)) seen.add(c);
    for (const p of variableCodePredicates(s)) seen.add(p.code);
  }
  assert.deepEqual([...seen].sort(), [...ACTIVITY_CODES].sort());
});

test("severityBand unions the bands without flattening the variable codes", () => {
  const band = severityBand(["warning", "error"]);
  // A succeeded run must NOT be dragged into an incident view just because
  // `run.finished` appears in the error band under a different params value.
  assert.ok(!band.codes.includes("run.finished"));
  const finished = band.predicates.filter((p) => p.code === "run.finished");
  assert.ok(finished.length > 0);
  assert.ok(!finished.some((p) => predicateMatches(p, { status: "succeeded" })));
  assert.ok(finished.some((p) => predicateMatches(p, { status: "failed" })));
});

test("severity=warning maps to no run status, so the run branch is suppressed", () => {
  // Without this, a `warning` filter leaves the run branch unfiltered and every
  // run in the window comes back beside the two warnings the user asked for.
  assert.deepEqual(runStatusesFor("warning"), []);
  assert.ok(runStatusesFor("error").length > 0);
  for (const s of RUN_STATUSES) {
    const sev = severityOfRunStatus(s);
    assert.ok(runStatusesFor(sev).includes(s), `${s} is not in its own band`);
  }
});

test("every run status falls in exactly one severity band", () => {
  for (const s of RUN_STATUSES) {
    const bands = SEVERITIES.filter((sev) => runStatusesFor(sev).includes(s));
    assert.equal(bands.length, 1, `${s} landed in ${bands.length} bands`);
  }
});

// ---------------------------------------------------------------------------
// The dictionary
// ---------------------------------------------------------------------------

test("every code has a template in all four languages", () => {
  for (const { code: lang } of LANGS) {
    const dict = activity[lang];
    assert.ok(dict, `no dictionary for ${lang}`);
    for (const code of ACTIVITY_CODES) {
      const t = dict.code[code];
      assert.ok(typeof t === "string" && t.length > 0, `${lang}.code.${code} is missing`);
    }
  }
});

test("every closed vocabulary the runtime can send is a key in all four languages", () => {
  const enDict = activity.en;
  const spaces = ["error", "skipReason", "denyReason"] as const;
  for (const { code: lang } of LANGS) {
    const dict = activity[lang];
    for (const space of spaces) {
      assert.deepEqual(
        Object.keys(dict[space]).sort(),
        Object.keys(enDict[space]).sort(),
        `${lang}.${space} has a different key set from en`,
      );
    }
    for (const s of SEVERITIES) assert.ok(dict.severity[s]);
    for (const t of RUN_TRIGGERS) assert.ok(dict.trigger[t]);
    for (const s of RUN_STATUSES) assert.ok(dict.status[s]);
    for (const p of STEP_PHASES) assert.ok(dict.phase[p]);
    for (const t of ACTIVITY_TAGS) assert.ok(dict.tag[t]);
  }
});

test("the contract's 18 errorCode values are all present", () => {
  const contract = [
    "model_unavailable", "provider_rate_limited", "provider_auth_failed",
    "credit_cap_reached", "daily_action_limit", "max_runs_per_day",
    "approval_timeout", "tool_disabled", "sandbox_denied", "egress_blocked",
    "channel_send_failed", "channel_not_bound", "context_fetch_failed",
    "invalid_timezone", "skill_install_failed", "timeout", "out_of_memory",
    "internal_error",
  ];
  for (const { code: lang } of LANGS) {
    for (const c of contract) {
      assert.ok(activity[lang].error[c], `${lang}.error.${c} is missing`);
    }
  }
});

test("every skipReason has a sentence — it is the most-asked support question", () => {
  // "Why didn't it run?" is unanswerable without these, which is why the
  // ArkAgent-originated four are here beside the runtime's seven.
  const reasons = [
    "instance_stopped", "overlap", "outside_working_hours", "disabled",
    "credit_cap_reached", "max_runs_per_day", "daily_action_limit",
    "channel_not_bound", "misfire", "misfire_too_old", "dispatch_unsupported",
  ];
  for (const { code: lang } of LANGS) {
    for (const r of reasons) assert.ok(activity[lang].skipReason[r], `${lang}.skipReason.${r}`);
  }
});

test("every empty state exists for all six views, six reasons, four languages", () => {
  // At launch nothing writes the runtime tables, so this is the page — a
  // missing pair here is a blank screen for most users on day one.
  const views = ["timeline", "runs", "toolCalls", "health", "cost", "errors"] as const;
  const reasons = [
    "no_data_yet", "never_provisioned", "runtime_mock",
    "runtime_unconfigured", "telemetry_unsupported", "filtered_out",
  ] as const;
  for (const { code: lang } of LANGS) {
    for (const v of views) {
      for (const r of reasons) {
        const copy = activity[lang].empty[v][r];
        assert.ok(copy && copy.title.length > 0 && copy.body.length > 0, `${lang}.empty.${v}.${r}`);
      }
    }
  }
});

test("the three degradation banners exist in all four languages", () => {
  for (const { code: lang } of LANGS) {
    for (const k of ["mock", "unconfigured", "degraded"] as const) {
      assert.ok(activity[lang].banner[k], `${lang}.banner.${k}`);
    }
  }
});

test("no language falls back to the English sentence", () => {
  // An English string in the middle of a Japanese feed reads as a bug in the
  // agent, not as a gap in a dictionary — so identical copy across languages is
  // treated as untranslated rather than as a coincidence.
  for (const lang of ["zh", "zht", "ja"] as const) {
    for (const code of ACTIVITY_CODES) {
      if (code === "custom") continue; // "{text}" is the row's own text, unlocalised by design
      assert.notEqual(
        activity[lang].code[code],
        activity.en.code[code],
        `${lang}.code.${code} is still the English string`,
      );
    }
    for (const v of ["timeline", "runs", "health", "cost", "errors", "toolCalls"] as const) {
      assert.notEqual(
        activity[lang].empty[v].no_data_yet.body,
        activity.en.empty[v].no_data_yet.body,
        `${lang}.empty.${v}.no_data_yet is still English`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Interpolation — the untrusted half
// ---------------------------------------------------------------------------

test("interpolation is single-pass, so a param cannot pull in another param", () => {
  // `params` is third-party text from a remote runtime. A recursive or two-pass
  // substitution would let a value containing {secret} expand a second hole.
  const out = interpolate("Sent on {channel}", { channel: "{secret}", secret: "s3cr3t" });
  assert.equal(out, "Sent on {secret}");
  assert.ok(!out.includes("s3cr3t"));
});

test("a hole with no param is left visible rather than blanked", () => {
  assert.equal(interpolate("Run {status} in {durationMs} ms", { status: "failed" }),
    "Run failed in {durationMs} ms");
});

test("interpolation never executes or unescapes anything", () => {
  const out = interpolate(activity.en.code["message.received"], {
    senderLabel: "</span><script>alert(1)</script>",
    channel: "slack",
  });
  // The value survives verbatim as a string. Escaping is the renderer's job,
  // and it renders a text node — nothing here is allowed to produce markup.
  assert.ok(out.includes("<script>"));
  assert.ok(!out.includes("{senderLabel}"));
});

test("activityLine renders text for legacy and custom rows, templates otherwise", () => {
  const d = activity.en;
  assert.equal(activityLine(d, null, {}, "Agent paused by operator"), "Agent paused by operator");
  assert.equal(activityLine(d, "custom", {}, "whatever the agent wrote"), "whatever the agent wrote");
  assert.equal(activityLine(d, "run.started", { trigger: "schedule" }, ""), "Run started (schedule)");
});

test("an unmapped key renders as the raw key rather than throwing", () => {
  // Contract rule: ugly, honest, never a crash — and never an English fallback.
  const broken = { ...activity.ja, code: { ...activity.ja.code } };
  delete (broken.code as Record<string, string>)["run.started"];
  assert.equal(activityLine(broken, "run.started", {}, ""), "run.started");
});

test("severity labels exist for every band the filter chips can offer", () => {
  for (const { code: lang } of LANGS) {
    const seen = new Set<string>();
    for (const s of SEVERITIES) seen.add(activity[lang].severity[s]);
    // Four distinct words, or two bands are indistinguishable in the chip row.
    assert.equal(seen.size, SEVERITIES.length, `${lang} severity labels collide`);
  }
});

test("a severity value is never a stored column value we would trust", () => {
  // Guard against a future refactor that reads params.severity for every code.
  // Only `error.raised` may do so; everything else must ignore it.
  for (const code of ACTIVITY_CODES) {
    if (code === "error.raised") continue;
    assert.equal(
      severityOf(code, { severity: "error" }),
      severityOf(code, {}),
      `${code} let the runtime grade itself`,
    );
  }
});

test("severityOf tolerates junk without throwing", () => {
  const junk = { status: 42, to: 7, severity: 0 } as Record<string, string | number>;
  for (const code of ACTIVITY_CODES) {
    assert.doesNotThrow(() => severityOf(code, junk));
  }
  assert.doesNotThrow(() => severityOf("not-a-code" as string, {}));
});

test("variable predicates carry the coalesce fallback the SQL needs", () => {
  // `coalesce(params->>'severity','error')` is what puts an unlabelled failure
  // in the error band. A predicate that forgot the fallback would drop it.
  const errorBand = variableCodePredicates("error");
  const raised = errorBand.find((p) => p.code === "error.raised");
  assert.ok(raised);
  assert.equal(raised.fallback, "error");
  assert.equal(raised.negate, true);
  assert.ok(predicateMatches(raised, {}));
});

test("filter values map to codes, so `type` can be pushed into an IN list", () => {
  const codes = constantCodes("info" as Severity);
  assert.ok(codes.every((c) => (ACTIVITY_CODES as readonly string[]).includes(c)));
  // The variable codes are never in a constant list; that is what makes the
  // index-served IN list safe to OR with the params tests.
  for (const s of SEVERITIES) {
    for (const c of constantCodes(s)) {
      assert.ok(!(VARIABLE_CODES as readonly string[]).includes(c), `${c} is in both arms`);
    }
  }
});
