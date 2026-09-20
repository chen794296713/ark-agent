import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { agentCatalog, agentHireHref, getAgent } from "../lib/agent-catalog";
import type { Lang } from "../lib/types";

const locales: Lang[] = ["en", "zh", "zht", "ja"];
const requestedRoles = [
  ["recruiting", "Recruiting Agent"],
  ["job-applicant", "Job Applicant Agent"],
  ["video-creator", "Video Creator Agent"],
  ["sales-outreach", "Sales Outreach Agent"],
  ["email-assistant", "Email Assistant Agent"],
];

test("the catalogue offers all five requested roles with unique identifiers", () => {
  assert.deepEqual(agentCatalog.map((agent) => [agent.slug, agent.copy.en.name]), requestedRoles);
  assert.equal(new Set(agentCatalog.map((agent) => agent.slug)).size, 5);
  for (const agent of agentCatalog) {
    assert.ok(agent.image.startsWith("/images/agents/"));
    assert.ok(existsSync(resolve("public", agent.image.slice(1))), `${agent.slug} portrait must ship`);
  }
});

test("role links and lookup preserve the role the visitor selected", () => {
  for (const agent of agentCatalog) {
    assert.equal(getAgent(agent.slug), agent);
    const destination = new URL(agentHireHref(agent.slug), "https://example.test");
    assert.equal(destination.pathname, "/hire");
    assert.equal(destination.searchParams.get("agent"), agent.slug);
  }
});

test("unknown or injected URL values never become a different role", () => {
  for (const slug of [undefined, null, "", "RECRUITING", "unknown", "../recruiting", "email-assistant&role=admin", "__proto__"]) {
    assert.equal(getAgent(slug), undefined, String(slug));
    assert.equal(agentHireHref(slug), "/hire", String(slug));
  }
});

test("every locale has a complete editable brief and useful product detail content", () => {
  for (const agent of agentCatalog) {
    assert.deepEqual(Object.keys(agent.copy).sort(), [...locales].sort());
    for (const locale of locales) {
      const copy = agent.copy[locale];
      for (const field of ["name", "summary", "headline", "description", "instructions", "rules", "toolNote", "sampleTitle"] as const) {
        assert.ok(copy[field].trim().length >= 4, `${agent.slug}.${locale}.${field}`);
      }
      for (const field of ["tasks", "deliverables", "sampleLines"] as const) {
        assert.ok(copy[field].length >= 3, `${agent.slug}.${locale}.${field}`);
        assert.ok(copy[field].every((line) => line.trim().length >= 4), `${agent.slug}.${locale}.${field}`);
      }
      assert.ok(copy.instructions.length >= 50, `${agent.slug}.${locale} needs a usable starting brief`);
      assert.ok(copy.rules.length >= 50, `${agent.slug}.${locale} needs explicit operating boundaries`);
      if (locale !== "en") {
        assert.notEqual(copy.instructions, agent.copy.en.instructions);
        assert.notEqual(copy.toolNote, agent.copy.en.toolNote);
      }
    }
  }
});

test("briefs retain the agreed limits instead of promising unavailable automation", () => {
  assert.match(getAgent("recruiting")!.copy.en.rules, /Do not make autonomous hiring or rejection decisions/);
  assert.match(getAgent("job-applicant")!.copy.en.rules, /Do not submit applications automatically/);
  assert.match(getAgent("video-creator")!.copy.en.toolNote, /rendering and publishing require suitable connected tools/);
  assert.match(getAgent("sales-outreach")!.copy.en.rules, /Send messages only with my explicit permission/);
  assert.match(getAgent("email-assistant")!.copy.en.rules, /Send or forward email only with my explicit permission/);
  for (const agent of agentCatalog) {
    assert.match(agent.copy.en.toolNote, /connected tools/);
    assert.match(agent.copy.en.sampleTitle, /example/);
  }
});
