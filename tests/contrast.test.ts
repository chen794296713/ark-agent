/**
 * The colour ramp's contract, enforced against the real stylesheet.
 *
 * The product owner's complaint was "the font color is too grey". The audit
 * found that the AAA claim in `app/globals.css`'s header comment was false in
 * five of the six palettes — ivory-light's `--c-muted` measured **4.13:1** on
 * the page background while the comment asserted 7:1, and the product leans
 * hard on 10–12px mono for labels, badges, timestamps and axis ticks.
 *
 * This parses the stylesheet itself rather than a copy of the values, so a hand
 * edit to a palette cannot pass while the tokens say otherwise. Every tier is
 * checked against ALL FOUR surfaces it can be painted on, because clearing on
 * `--c-bg` and failing on `--c-hover` is the usual way this regresses.
 *
 * The contract (docs/UI_DESIGN_V2.md §A.2):
 *   --c-text   >= 13:1   primary — headings, values, active nav
 *   --c-text2  >= 9.5:1  DEFAULT BODY COPY
 *   --c-muted  >= 7:1    secondary copy and all mono field labels
 *   --c-faint  >= 4.5:1  tertiary only — never a sentence
 *   status/accent colours >= 4.5:1 (they are used at 11px)
 *   --c-border-field >= 3:1 (WCAG 1.4.11, non-text)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// WCAG 2.x relative luminance and contrast
// ---------------------------------------------------------------------------

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio, 1..21. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ---------------------------------------------------------------------------
// Parse the palettes out of the stylesheet
// ---------------------------------------------------------------------------

type Palette = Record<string, string>;

function parsePalettes(css: string): Map<string, Palette> {
  const out = new Map<string, Palette>();
  const lines = css.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const selector = lines[i].match(/^(:root|\[data-direction="(\w+)"\]\[data-theme="(\w+)"\])\s*\{/);
    if (!selector) continue;
    let depth = 0;
    const tokens: Palette = {};
    for (let j = i; j < lines.length; j++) {
      depth += (lines[j].match(/\{/g) ?? []).length - (lines[j].match(/\}/g) ?? []).length;
      const decl = lines[j].match(/^\s*(--c-[\w-]+):\s*([^;]+);/);
      if (decl) tokens[decl[1]] = decl[2].trim();
      if (depth === 0 && j > i) break;
    }
    // The second bare `:root` in the file is the responsive-token layer, which
    // declares no colours; only a block carrying the ramp is a palette.
    if (!tokens["--c-text"]) continue;
    const name = selector[2] ? `${selector[2]}-${selector[3]}` : "root-fallback";
    out.set(name, tokens);
  }
  return out;
}

const CSS = readFileSync("app/globals.css", "utf8");
const PALETTES = parsePalettes(CSS);

/** Every surface a piece of text can sit on. */
const SURFACES = ["--c-bg", "--c-panel", "--c-panel-deep", "--c-hover"] as const;

/** token -> floor. */
const TEXT_FLOORS: Record<string, number> = {
  "--c-text": 13,
  "--c-text2": 9.5,
  "--c-muted": 7,
  "--c-faint": 4.5,
  // Status and accent colours are used at 11px mono, so they take the same
  // small-text floor as `faint` rather than the 3:1 large-text allowance.
  "--c-accent": 4.5,
  "--c-green": 4.5,
  "--c-amber": 4.5,
  "--c-red": 4.5,
  "--c-blue": 4.5,
  "--c-orange": 4.5,
};

// ---------------------------------------------------------------------------

test("all six palettes plus the :root fallback are present", () => {
  const names = [...PALETTES.keys()].sort();
  assert.deepEqual(names, [
    "ivory-dark", "ivory-light", "midnight-dark", "midnight-light",
    "root-fallback", "terminal-dark", "terminal-light",
  ]);
});

test("every palette declares the same token set", () => {
  // `:root` is the universal fallback: any token a later block forgets resolves
  // to a terminal-dark value, which half-works and is the worst failure mode.
  const reference = new Set(Object.keys(PALETTES.get("terminal-dark")!));
  for (const [name, tokens] of PALETTES) {
    const missing = [...reference].filter((t) => !(t in tokens));
    assert.deepEqual(missing, [], `${name} is missing ${missing.join(", ")}`);
  }
});

test("every text tier clears its floor on every surface, in every palette", () => {
  const failures: string[] = [];
  for (const [name, tokens] of PALETTES) {
    for (const [token, floor] of Object.entries(TEXT_FLOORS)) {
      const fg = tokens[token];
      if (!fg?.startsWith("#")) continue;
      for (const surface of SURFACES) {
        const bg = tokens[surface];
        if (!bg?.startsWith("#")) continue;
        const ratio = contrast(fg, bg);
        if (ratio < floor) {
          failures.push(
            `${name} ${token} on ${surface}: ${ratio.toFixed(2)} < ${floor} (${fg} on ${bg})`,
          );
        }
      }
    }
  }
  assert.deepEqual(failures, [], `\n  ${failures.join("\n  ")}\n`);
});

test("--c-border-field clears WCAG 1.4.11's 3:1 on every surface", () => {
  const failures: string[] = [];
  for (const [name, tokens] of PALETTES) {
    const fg = tokens["--c-border-field"];
    assert.ok(fg, `${name} has no --c-border-field`);
    for (const surface of SURFACES) {
      const ratio = contrast(fg, tokens[surface]);
      if (ratio < 3) failures.push(`${name} on ${surface}: ${ratio.toFixed(2)} < 3`);
    }
  }
  assert.deepEqual(failures, [], `\n  ${failures.join("\n  ")}\n`);
});

test("ink colours are readable on the fills they are painted on", () => {
  // Three latent bugs lived here: white on bright green measured 2.29 in
  // ivory-dark and 1.97 in midnight-dark, and midnight-dark's primary CTA —
  // `--c-ink` on `--c-lime` — was 3.16.
  const pairs: [string, string, number][] = [
    ["--c-ink", "--c-lime", 4.5],
    ["--c-green-ink", "--c-green", 4.5],
  ];
  const failures: string[] = [];
  for (const [name, tokens] of PALETTES) {
    for (const [ink, fill, floor] of pairs) {
      if (!tokens[ink]?.startsWith("#") || !tokens[fill]?.startsWith("#")) continue;
      const ratio = contrast(tokens[ink], tokens[fill]);
      if (ratio < floor) {
        failures.push(`${name} ${ink} on ${fill}: ${ratio.toFixed(2)} < ${floor}`);
      }
    }
  }
  assert.deepEqual(failures, [], `\n  ${failures.join("\n  ")}\n`);
});

test("the fixed role hues carry readable ink", () => {
  // `roleHue` values are FIXED — they do not switch with the palette — so they
  // pair with `--c-on-brand`, which is fixed dark for exactly this reason.
  // `--c-ink` would invert to near-white in a light palette and paint 1.13:1 on
  // the lime monogram.
  const onBrand = PALETTES.get("terminal-dark")!["--c-on-brand"];
  const roleHues = {
    prospector: "#D8FF3E", salesmkt: "#E8804F", admin: "#F472B6", hr: "#4FD1C5",
    support: "#6AA6FF", legal: "#94A3B8", content: "#A78BFA", opc: "#FBBF24",
  };
  for (const [role, hue] of Object.entries(roleHues)) {
    const ratio = contrast(onBrand, hue);
    assert.ok(ratio >= 4.5, `${role} monogram: ${ratio.toFixed(2)} < 4.5 (${onBrand} on ${hue})`);
  }
  // And it must be the same fixed value everywhere, or a role tile changes ink
  // when the user switches theme while the fill does not move.
  for (const [name, tokens] of PALETTES) {
    assert.equal(tokens["--c-on-brand"], onBrand, `${name} forked --c-on-brand`);
  }
});

test("accent text is readable on the tinted washes it is painted on", () => {
  // A colour that clears on --c-panel can still fail on the wash it actually
  // sits on: `Chip` renders c.accent on c.limeWash.
  const pairs: [string, string][] = [
    ["--c-accent", "--c-lime-wash"],
    ["--c-accent", "--c-lime-wash2"],
    ["--c-green", "--c-green-wash"],
    ["--c-red", "--c-red-wash"],
  ];
  const failures: string[] = [];
  for (const [name, tokens] of PALETTES) {
    for (const [fg, bg] of pairs) {
      if (!tokens[fg]?.startsWith("#") || !tokens[bg]?.startsWith("#")) continue;
      const ratio = contrast(tokens[fg], tokens[bg]);
      if (ratio < 4.5) failures.push(`${name} ${fg} on ${bg}: ${ratio.toFixed(2)} < 4.5`);
    }
  }
  assert.deepEqual(failures, [], `\n  ${failures.join("\n  ")}\n`);
});

test("the four tiers stay visually stepped, so hierarchy survives the lift", () => {
  // Raising every tier until it passes would flatten them into one grey. Each
  // step must remain perceptible on the surface most copy actually sits on.
  for (const [name, tokens] of PALETTES) {
    const panel = tokens["--c-panel"];
    const [text, text2, muted, faint] = ["--c-text", "--c-text2", "--c-muted", "--c-faint"].map(
      (t) => contrast(tokens[t], panel),
    );
    assert.ok(text > text2, `${name}: text (${text.toFixed(2)}) must exceed text2 (${text2.toFixed(2)})`);
    assert.ok(text2 > muted, `${name}: text2 (${text2.toFixed(2)}) must exceed muted (${muted.toFixed(2)})`);
    assert.ok(muted > faint, `${name}: muted (${muted.toFixed(2)}) must exceed faint (${faint.toFixed(2)})`);
    assert.ok(
      text2 / muted >= 1.15,
      `${name}: text2 and muted are too close to tell apart (${(text2 / muted).toFixed(2)}×)`,
    );
    assert.ok(
      muted / faint >= 1.25,
      `${name}: muted and faint are too close to tell apart (${(muted / faint).toFixed(2)}×)`,
    );
  }
});
