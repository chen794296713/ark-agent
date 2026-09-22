# ArkAgent v2 — UI Design


**Contents**

| § | subject |
|---|---|
| [A](#a-the-contrast--weight-fix) | The contrast & weight fix — diagnosis, new hex for all six palettes, the `w` weight tokens |
| [B](#b-template-page--dashboardtemplates) | Template page — card + list, filters, drawer, empty states, untrusted-text rule |
| [C](#c-the-ai-guided-creation-flow) | AI-guided creation — describe, SSE stages, the six-section review, the AI help affordance |
| [D](#d-skill-repository--dashboardskills) | Skill Repository — facets, risk disclosure, add-to-agent |
| [E](#e-agent-management--dashboardfleetidtabconfig) | Agent configuration — nine sections, dirty state, save & re-sync |
| [F](#f-activity--dashboardfleetidtabactivity) | Activity — timeline, run drill-down, health, cost |
| [G](#g-component-inventory) | Component inventory |
| [H](#h-responsive-rules) | Responsive tokens and per-screen behaviour |
| [I](#i-accessibility) | Accessibility, including the contrast proof as a test |
| [J](#j-localisation) | Localisation |
| [K](#k-implementation-order) · [RISKS](#risks) | Order of work, and eight risks |

---

**Audience A — engineers in this repo.** Every hex, every pixel, every token name here is
implementable as-is against the inline-style + CSS-custom-property idiom already in `lib/theme.ts`
and `app/globals.css`. Nothing here introduces Tailwind, CSS modules, or a component library.

**Audience B — the backend team.** Sections B, C, E and F name the exact fields each screen
renders. If a field is listed in a wireframe and is not in `docs/DATABASE.md`, that screen cannot
ship. The DTO shapes are written out so you can populate them.

**Scope.** (a) the contrast + weight fix, (b) `/dashboard/templates`, (c) the AI-guided creation
flow, (d) `/dashboard/skills`, (e) the agent configuration page, (f) the rich Activity page,
(g) shared components, (h) responsive tokens, (i) accessibility.

**Non-scope.** The landing page, auth, billing, payment and admin screens change only by inheriting
the new colour and weight tokens. No layout work there in v2.

---

# A. THE CONTRAST & WEIGHT FIX

## A.0 The complaint, stated precisely

> "the font colour is too grey and the weight too light"

Two separate defects, both real, both measurable.

**Defect 1 — the ramp collapses at its bottom two tiers.** `app/globals.css:59-64` carries this
comment:

> "Contrast floors, measured per palette against that palette's own `--c-panel` … body ink clears
> AAA (7:1) everywhere, and the 10-12px mono tiers … clear AA (4.5:1)."

**That claim is false in five of six palettes.** I recomputed every tier against every surface
using the WCAG 2.1 relative-luminance formula. Results below; the failures are not marginal.

**Defect 2 — the weight scale has a hole in the middle.** Across `app/**` and `components/**`
there are exactly four numeric weights in use: `400` (5 occurrences), `500` (25), `600` (18),
`700` (119). Body copy carries no explicit `fontWeight` at all, so it inherits `400` from the
`body` rule at `app/globals.css:674-684`. The result is a two-state typography system —
*regular* or *heavy* — with the entire reading surface pinned to the lighter state, rendered
`-webkit-font-smoothing: antialiased` on a dark ground where thin stems visually erode.

## A.1 Measured "before" — every text tier, every palette, every surface

Contrast ratios, WCAG 2.1. `deep` = `--c-panel-deep`, `hover` = `--c-hover`.
**Bold = below the floor the code comments claim.**

| palette | token | value | on `bg` | on `panel` | on `deep` | on `hover` | worst | level |
|---|---|---|---|---|---|---|---|---|
| terminal-dark | `--c-text` | `#F5F8FC` | 18.27 | 16.05 | 14.51 | 14.33 | 14.33 | AAA |
| terminal-dark | `--c-text2` | `#D7DEE9` | 14.38 | 12.63 | 11.42 | 11.28 | 11.28 | AAA |
| terminal-dark | `--c-muted` | `#AEB8C6` | 9.70 | 8.53 | 7.71 | 7.61 | 7.61 | AAA |
| terminal-dark | `--c-faint` | `#7E8896` | 5.42 | 4.76 | **4.31** | **4.25** | **4.25** | **FAIL AA** |
| terminal-light | `--c-text` | `#0F141C` | 16.91 | 18.47 | 16.43 | 16.74 | 16.43 | AAA |
| terminal-light | `--c-text2` | `#39424F` | 9.31 | 10.16 | 9.04 | 9.21 | 9.04 | AAA |
| terminal-light | `--c-muted` | `#586273` | **5.64** | **6.16** | **5.48** | **5.58** | **5.48** | **AA only** |
| terminal-light | `--c-faint` | `#8A94A3` | **2.81** | **3.07** | **2.73** | **2.78** | **2.73** | **FAIL** |
| ivory-dark | `--c-text` | `#F4ECE0` | 15.23 | 14.13 | 13.71 | 14.07 | 13.71 | AAA |
| ivory-dark | `--c-text2` | `#D8CBBA` | 11.19 | 10.38 | 10.08 | 10.34 | 10.08 | AAA |
| ivory-dark | `--c-muted` | `#AA9C8A` | **6.66** | **6.17** | **5.99** | **6.15** | **5.99** | **AA only** |
| ivory-dark | `--c-faint` | `#7E7060` | **3.72** | **3.45** | **3.35** | **3.43** | **3.35** | **FAIL** |
| ivory-light | `--c-text` | `#241F18` | 14.28 | 16.35 | 14.14 | 14.14 | 14.14 | AAA |
| ivory-light | `--c-text2` | `#463D30` | 9.30 | 10.66 | 9.22 | 9.22 | 9.22 | AAA |
| ivory-light | `--c-muted` | `#7C7263` | **4.13** | **4.73** | **4.09** | **4.09** | **4.09** | **FAIL AA** |
| ivory-light | `--c-faint` | `#A99E8C` | **2.30** | **2.64** | **2.28** | **2.28** | **2.28** | **FAIL** |
| midnight-dark | `--c-text` | `#EAF1FF` | 16.84 | 15.26 | 14.07 | 14.07 | 14.07 | AAA |
| midnight-dark | `--c-text2` | `#BFCCE6` | 11.81 | 10.70 | 9.87 | 9.87 | 9.87 | AAA |
| midnight-dark | `--c-muted` | `#8C9ABA` | **6.77** | **6.13** | **5.65** | **5.65** | **5.65** | **AA only** |
| midnight-dark | `--c-faint` | `#5E6E92` | **3.75** | **3.39** | **3.13** | **3.13** | **3.13** | **FAIL** |
| midnight-light | `--c-text` | `#0C1424` | 16.40 | 18.40 | 15.93 | 16.37 | 15.93 | AAA |
| midnight-light | `--c-text2` | `#33415C` | 9.12 | 10.24 | 8.86 | 9.11 | 8.86 | AAA |
| midnight-light | `--c-muted` | `#586A87` | **4.89** | **5.49** | **4.75** | **4.88** | **4.75** | **AA only** |
| midnight-light | `--c-faint` | `#8A97B0` | **2.62** | **2.94** | **2.55** | **2.62** | **2.55** | **FAIL** |

**Read the table with the usage counts and the diagnosis writes itself:**

| token | occurrences in `app/` + `components/` | typical size | verdict |
|---|---|---|---|
| `c.text` | 103 | 13–34px | fine |
| `c.text2` | 59 | 12–15px | fine |
| `c.muted` | 157 | **13px (20 sites), 14px (8), 15px (6)** | carries *reading copy*, clears only AA — one palette fails AA outright |
| `c.faint` | 176 | **11px (20), 12px (26), 13px (7)** | carries labels, timestamps, hints and `::placeholder` at 11–12px, **fails AA in four of six palettes** |

`c.faint` is the single most-used colour token in the app and it is the one that fails hardest.
That is the "too grey", and it is two failures stacked. `--c-muted` at `#7C7263` on ivory-light's
`#F4EFE6` page is **4.13:1** — below the AA floor for normal text — and it renders every `sLabel`
(`fleet/[id]/page.tsx:1419-1426`, `fontSize: 11, color: c.muted`). `--c-faint` at `#A99E8C` is
**2.30:1** on the same ground and renders every `SettingCard` description
(`fleet/[id]/page.tsx:1484`, `fontSize: 12.5, color: c.faint`), every `Field` hint (`:1495`) and
every `Toggle` desc (`:1545`) — full sentences at a ratio below the *large-text* floor.

### Worked relative-luminance proof (one cell, so the method is auditable)

`--c-faint: #A99E8C` on `--c-panel: #FFFFFF`, ivory-light.

```
sRGB → linear:   f(v) = v / 12.92                    if v ≤ 0.04045
                 f(v) = ((v + 0.055) / 1.055) ^ 2.4  otherwise      (v = channel / 255)
relative luminance:  L = 0.2126·R_lin + 0.7152·G_lin + 0.0722·B_lin
contrast ratio:      (L_lighter + 0.05) / (L_darker + 0.05)
```

```
#A99E8C
  R = 169/255 = 0.662745 → ((0.662745+0.055)/1.055)^2.4 = (0.680327)^2.4 = 0.396755
  G = 158/255 = 0.619608 → ((0.619608+0.055)/1.055)^2.4 = (0.639438)^2.4 = 0.341114
  B = 140/255 = 0.549020 → ((0.549020+0.055)/1.055)^2.4 = (0.572531)^2.4 = 0.262251
  L = 0.2126(0.396755) + 0.7152(0.341114) + 0.0722(0.262251)
    = 0.084350 + 0.243965 + 0.018935
    = 0.347250

#FFFFFF
  L = 1.000000

ratio = (1.000000 + 0.05) / (0.347250 + 0.05) = 1.05 / 0.39725 = 2.643
```

**2.64:1.** WCAG AA for normal text is 4.5:1. It is not close. The same arithmetic on the
proposed replacement `#746959`:

```
#746959
  R = 116/255 = 0.454902 → 0.171441
  G = 105/255 = 0.411765 → 0.141263
  B =  89/255 = 0.349020 → 0.099899
  L = 0.2126(0.171441) + 0.7152(0.141263) + 0.0722(0.099899)
    = 0.036448 + 0.101031 + 0.007213
    = 0.144692

ratio = 1.05 / 0.194692 = 5.393   →  5.37 after 8-bit rounding of the solved value
```

**5.37:1 on panel, 4.65:1 on the worst surface (`--c-panel-deep`).** AA with margin.

## A.2 The fix is a re-specification of the ramp, not a nudge

The four tiers currently have no written contract, so they drift into each other. Fix the contract
first; the hex values then fall out of it.

| tier | contract | floor (worst of `bg`/`panel`/`panel-deep`/`hover`) | what uses it |
|---|---|---|---|
| `--c-text` | Primary. Headings, agent names, stat values, input values, active nav. | **≥ 13:1 (AAA)** | `font.space` display, 14px+ sans values |
| `--c-text2` | **Default body copy.** Paragraphs, table cells, chat bodies, list rows. | **≥ 9.5:1 (AAA)** | 13–15px sans |
| `--c-muted` | Secondary copy and **all mono field labels**. Section descriptions, helper text under fields, column headers, axis labels. | **≥ 7:1 (AAA)** | 11–13px mono + 12–13px sans |
| `--c-faint` | **Tertiary only.** Timestamps, ordinals, disabled state, `::placeholder`, decorative counters. Never a full sentence the user must read to operate the product. | **≥ 4.5:1 (AA)** | 10–12px mono |

Two rules that come with the contract and must be enforced in review:

1. **`c.faint` may not carry a sentence.** Every current use of `c.faint` on a `hint` or `desc`
   string moves to `c.muted`. Concretely: `SettingCard`'s `desc` (`fleet/[id]/page.tsx:1484`),
   `Field`'s `hint` (`:1495`), `Toggle`'s `desc` (`:1545`), and the `saveNote` (`:2432`).
2. **Four tiers must stay visually stepped.** The step ratios on `--c-panel` after the fix are
   1.27–1.71× / 1.35–1.48× / 1.51–1.65× — still a legible ladder, so the hierarchy the design
   depends on survives the lift.

Rejected alternative: adding a fifth tier (`--c-text3`) between `muted` and `faint`. It would have
let `faint` stay dim, but 185 call sites would each need a judgement call about which of two
similar greys they wanted, and the ramp would stop being scannable. One tier's semantics changed
is cheaper and more legible than one tier added.

## A.3 New hex values — all six palettes

Values were derived by holding each token's OKLCH hue and chroma fixed and binary-searching
lightness until the tier's floor was met against **all four** surfaces (`--c-bg`, `--c-panel`,
`--c-panel-deep`, `--c-hover`), then gamut-clamping chroma. Hue is preserved to within rounding,
so the palettes keep their character — terminal stays cool-blue-grey, ivory stays warm-taupe,
midnight stays slate-blue. **This is a contrast fix, not a redesign.**

Cells marked `=` are unchanged.

### A.3.1 TERMINAL LIME — dark  (`bg #0A0D12` · `panel #161C26` · `deep #1C2531` · `hover #1D2632`)

| token | old | **new** | bg | panel | deep | hover | worst | level |
|---|---|---|---|---|---|---|---|---|
| `--c-text` | `#F5F8FC` | `=` | 18.27 | 16.05 | 14.51 | 14.33 | 14.33 | **AAA** |
| `--c-text2` | `#D7DEE9` | `=` | 14.38 | 12.63 | 11.42 | 11.28 | 11.28 | **AAA** |
| `--c-muted` | `#AEB8C6` | `=` | 9.70 | 8.53 | 7.71 | 7.61 | 7.61 | **AAA** |
| `--c-faint` | `#7E8896` | **`#848E9C`** | 5.87 | 5.15 | 4.66 | 4.60 | 4.60 | **AA** |
| `--c-accent` | `#D8FF3E` | `=` | 16.95 | 14.89 | 13.47 | 13.30 | 13.30 | **AAA** |
| `--c-green` | `#4ADE80` | `=` | 11.17 | 9.81 | 8.87 | 8.76 | 8.76 | **AAA** |
| `--c-amber` | `#FBBF24` | `=` | 11.66 | 10.24 | 9.26 | 9.15 | 9.15 | **AAA** |
| `--c-red` | `#fb8b8b` | `#FB8B8B` | 8.49 | 7.46 | 6.75 | 6.66 | 6.66 | **AA** |
| `--c-blue` | `#6aa6ff` | `#6AA6FF` | 7.89 | 6.93 | 6.27 | 6.19 | 6.19 | **AA** |
| `--c-orange` | `#e8804f` | `#E8804F` | 7.07 | 6.21 | 5.62 | 5.55 | 5.55 | **AA** |
| `--c-border-field` | *(new)* | **`#647084`** | 3.88 | 3.41 | 3.09 | 3.05 | 3.05 | **1.4.11 pass** |

Terminal-dark was always the palette the ramp was tuned on, which is why only one value moves.
Every other palette was a copy that never got re-measured.

### A.3.2 TERMINAL LIME — light  (`bg #F3F5F8` · `panel #FFFFFF` · `deep #EEF2F7` · `hover #F1F4F8`)

| token | old | **new** | bg | panel | deep | hover | worst | level |
|---|---|---|---|---|---|---|---|---|
| `--c-text` | `#0F141C` | `=` | 16.91 | 18.47 | 16.43 | 16.74 | 16.43 | **AAA** |
| `--c-text2` | `#39424F` | **`#363E4B`** | 9.87 | 10.78 | 9.59 | 9.77 | 9.59 | **AAA** |
| `--c-muted` | `#586273` | **`#485263`** | 7.22 | 7.89 | 7.02 | 7.15 | 7.02 | **AAA** |
| `--c-faint` | `#8A94A3` | **`#646D7C`** | 4.78 | 5.22 | 4.65 | 4.73 | 4.65 | **AA** |
| `--c-accent` | `#4C7A00` | **`#487304`** | 5.16 | 5.63 | 5.01 | 5.10 | 5.01 | **AA** |
| `--c-lime` | `#4C7A00` | **`#487304`** | — | — | — | — | — | fill; `--c-ink #FFFFFF` on it = **5.63 AA** |
| `--c-lime-hover` | `#3E6500` | **`#3B6003`** | — | — | — | — | — | pressed fill |
| `--c-green` | `#1F9D57` | **`#007E41`** | 4.74 | 5.17 | 4.60 | 4.69 | 4.60 | **AA** |
| `--c-amber` | `#B7791F` | **`#986100`** | 4.75 | 5.19 | 4.62 | 4.71 | 4.62 | **AA** |
| `--c-red` | `#b52424` | `#B52424` | 5.93 | 6.48 | 5.76 | 5.87 | 5.76 | **AA** |
| `--c-blue` | `#1d4ed8` | `#1D4ED8` | 6.14 | 6.70 | 5.96 | 6.07 | 5.96 | **AA** |
| `--c-orange` | `#98461c` | `#98461C` | 5.96 | 6.51 | 5.79 | 5.90 | 5.79 | **AA** |
| `--c-border-field` | *(new)* | **`#858C97`** | 3.10 | 3.39 | 3.02 | 3.07 | 3.02 | **1.4.11 pass** |

`--c-green` and `--c-amber` had to move: at `#1F9D57` / `#B7791F` a *"● running"* status label at
11px mono was **3.19:1** and **3.33:1** — large-text-only ratios used for the smallest text in the
product. Darkening them also fixes the white-on-green badge (`--c-green-ink: #FFFFFF` over
`--c-green` was 3.49:1, now **5.17:1**).

### A.3.3 IVORY STUDIO — dark  (`bg #1A1714` · `panel #221E1A` · `deep #272019` · `hover #241E18`)

| token | old | **new** | bg | panel | deep | hover | worst | level |
|---|---|---|---|---|---|---|---|---|
| `--c-text` | `#F4ECE0` | `=` | 15.23 | 14.13 | 13.71 | 14.07 | 13.71 | **AAA** |
| `--c-text2` | `#D8CBBA` | `=` | 11.19 | 10.38 | 10.08 | 10.34 | 10.08 | **AAA** |
| `--c-muted` | `#AA9C8A` | **`#B8A997`** | 7.79 | 7.22 | 7.01 | 7.19 | 7.01 | **AAA** |
| `--c-faint` | `#7E7060` | **`#968777`** | 5.12 | 4.75 | 4.61 | 4.73 | 4.61 | **AA** |
| `--c-accent` | `#D8814F` | `=` | 6.10 | 5.65 | 5.49 | 5.63 | 5.49 | **AA** |
| `--c-green` | `#5FBE82` | `=` | 7.80 | 7.23 | 7.02 | 7.20 | 7.02 | **AAA** |
| `--c-amber` | `#E0A94C` | `=` | 8.46 | 7.84 | 7.61 | 7.81 | 7.61 | **AAA** |
| `--c-red` | `#fb8b8b` | `#FB8B8B` | 7.79 | 7.23 | 7.01 | 7.20 | 7.01 | **AAA** |
| `--c-blue` | `#6aa6ff` | `#6AA6FF` | 7.23 | 6.71 | 6.51 | 6.68 | 6.51 | **AA** |
| `--c-orange` | `#e8804f` | `#E8804F` | 6.49 | 6.02 | 5.84 | 5.99 | 5.84 | **AA** |
| `--c-green-ink` | `#ffffff` | **`#1A1714`** | — | — | — | — | — | **bug fix — see A.5** |
| `--c-border-field` | *(new)* | **`#746960`** | 3.34 | 3.10 | 3.01 | 3.09 | 3.01 | **1.4.11 pass** |

### A.3.4 IVORY STUDIO — light  (`bg #F4EFE6` · `panel #FFFFFF` · `deep`/`hover #F3EEE4`)

| token | old | **new** | bg | panel | deep | hover | worst | level |
|---|---|---|---|---|---|---|---|---|
| `--c-text` | `#241F18` | `=` | 14.28 | 16.35 | 14.14 | 14.14 | 14.14 | **AAA** |
| `--c-text2` | `#463D30` | **`#443B2E`** | 9.60 | 10.99 | 9.50 | 9.50 | 9.50 | **AAA** |
| `--c-muted` | `#7C7263` | **`#584E40`** | 7.11 | 8.14 | 7.04 | 7.04 | 7.04 | **AAA** |
| `--c-faint` | `#A99E8C` | **`#746959`** | 4.69 | 5.37 | 4.65 | 4.65 | 4.65 | **AA** |
| `--c-accent` | `#B65C36` | **`#A34A24`** | 5.15 | 5.90 | 5.10 | 5.10 | 5.10 | **AA** |
| `--c-lime` | `#B65C36` | **`#A34A24`** | — | — | — | — | — | fill; `--c-ink #FFFFFF` = **5.90 AA** |
| `--c-lime-hover` | `#9F4E2D` | **`#8E3C1B`** | — | — | — | — | — | pressed fill |
| `--c-green` | `#3E8E5A` | **`#277947`** | 4.69 | 5.37 | 4.64 | 4.64 | 4.64 | **AA** |
| `--c-amber` | `#9C6A16` | **`#926103`** | 4.66 | 5.34 | 4.62 | 4.62 | 4.62 | **AA** |
| `--c-red` | `#b52424` | `#B52424` | 5.65 | 6.48 | 5.60 | 5.60 | 5.60 | **AA** |
| `--c-blue` | `#1d4ed8` | `#1D4ED8` | 5.85 | 6.70 | 5.80 | 5.80 | 5.80 | **AA** |
| `--c-orange` | `#98461c` | `#98461C` | 5.68 | 6.51 | 5.63 | 5.63 | 5.63 | **AA** |
| `--c-border-field` | *(new)* | **`#91887A`** | 3.05 | 3.50 | 3.02 | 3.02 | 3.02 | **1.4.11 pass** |

**This is the worst palette today and the biggest visible change.** `--c-muted` moves 3 full
contrast points (4.13 → 7.11 on the page background). If a reviewer says "ivory looks different
now" — it does, and it was previously unreadable.

### A.3.5 MIDNIGHT CONSOLE — dark  (`bg #0A0F1E` · `panel #111A30` · `deep`/`hover #16213C`)

| token | old | **new** | bg | panel | deep | hover | worst | level |
|---|---|---|---|---|---|---|---|---|
| `--c-text` | `#EAF1FF` | `=` | 16.84 | 15.26 | 14.07 | 14.07 | 14.07 | **AAA** |
| `--c-text2` | `#BFCCE6` | `=` | 11.81 | 10.70 | 9.87 | 9.87 | 9.87 | **AAA** |
| `--c-muted` | `#8C9ABA` | **`#9EACCC`** | 8.39 | 7.60 | 7.01 | 7.01 | 7.01 | **AAA** |
| `--c-faint` | `#5E6E92` | **`#798AAF`** | 5.52 | 5.00 | 4.61 | 4.61 | 4.61 | **AA** |
| `--c-accent` | `#5B8CFF` | `=` | 6.04 | 5.47 | 5.04 | 5.04 | 5.04 | **AA** |
| `--c-green` | `#46D08A` | `=` | 9.68 | 8.77 | 8.09 | 8.09 | 8.09 | **AAA** |
| `--c-amber` | `#F0B84C` | `=` | 10.61 | 9.61 | 8.86 | 8.86 | 8.86 | **AAA** |
| `--c-red` | `#fb8b8b` | `#FB8B8B` | 8.33 | 7.55 | 6.96 | 6.96 | 6.96 | **AA** |
| `--c-blue` | `#6aa6ff` | `#6AA6FF` | 7.74 | 7.01 | 6.46 | 6.46 | 6.46 | **AA** |
| `--c-orange` | `#e8804f` | `#E8804F` | 6.94 | 6.29 | 5.80 | 5.80 | 5.80 | **AA** |
| `--c-ink` | `#FFFFFF` | **`#0A0F1E`** | — | — | — | — | — | **bug fix — see A.5** |
| `--c-green-ink` | `#ffffff` | **`#0A0F1E`** | — | — | — | — | — | **bug fix — see A.5** |
| `--c-border-field` | *(new)* | **`#5A6B95`** | 3.61 | 3.27 | 3.02 | 3.02 | 3.02 | **1.4.11 pass** |

### A.3.6 MIDNIGHT CONSOLE — light  (`bg #EEF2FA` · `panel #FFFFFF` · `deep #E9EFF9` · `hover #EDF2FA`)

| token | old | **new** | bg | panel | deep | hover | worst | level |
|---|---|---|---|---|---|---|---|---|
| `--c-text` | `#0C1424` | `=` | 16.40 | 18.40 | 15.93 | 16.37 | 15.93 | **AAA** |
| `--c-text2` | `#33415C` | **`#2F3C57`** | 9.83 | 11.02 | 9.54 | 9.81 | 9.54 | **AAA** |
| `--c-muted` | `#586A87` | **`#3F506C`** | 7.27 | 8.15 | 7.06 | 7.25 | 7.06 | **AAA** |
| `--c-faint` | `#8A97B0` | **`#5F6B83`** | 4.78 | 5.36 | 4.64 | 4.77 | 4.64 | **AA** |
| `--c-accent` | `#2F62E6` | **`#2758DC`** | 5.32 | 5.97 | 5.17 | 5.31 | 5.17 | **AA** |
| `--c-lime` | `#2F62E6` | **`#2758DC`** | — | — | — | — | — | fill; `--c-ink #FFFFFF` = **5.97 AA** |
| `--c-lime-hover` | `#244FBF` | **`#1E48B4`** | — | — | — | — | — | pressed fill |
| `--c-green` | `#1F9D57` | **`#047B40`** | 4.78 | 5.37 | 4.65 | 4.78 | 4.65 | **AA** |
| `--c-amber` | `#B7791F` | **`#965F03`** | 4.76 | 5.34 | 4.62 | 4.75 | 4.62 | **AA** |
| `--c-red` | `#b52424` | `#B52424` | 5.77 | 6.48 | 5.61 | 5.76 | 5.61 | **AA** |
| `--c-blue` | `#1d4ed8` | `#1D4ED8` | 5.97 | 6.70 | 5.80 | 5.96 | 5.80 | **AA** |
| `--c-orange` | `#98461c` | `#98461C` | 5.80 | 6.51 | 5.63 | 5.79 | 5.63 | **AA** |
| `--c-border-field` | *(new)* | **`#7F8A9D`** | 3.11 | 3.49 | 3.02 | 3.10 | 3.02 | **1.4.11 pass** |

### A.3.7 Tinted-surface pairs — the second-order check most palettes fail

A colour that clears on `--c-panel` can still fail on the wash it is actually painted on. `Chip`
(`fleet/[id]/page.tsx:1612-1639`) renders `color: c.accent` on `background: c.limeWash`; the
Skill and Template pages will do the same far more often. Verified with the new values:

| palette | `accent` on `limeWash` | on `limeWash2` | `green` on `greenWash` | `red` on `redWash` | `greenInk` on `green` | `ink` on `lime` (CTA) |
|---|---|---|---|---|---|---|
| terminal-dark | 14.44 AAA | 11.61 AAA | 9.81 AAA | 8.18 AAA | 11.17 AAA | 16.95 AAA |
| terminal-light | 5.07 AA | 4.59 AA | 4.65 AA | 5.57 AA | 5.17 AA | 5.63 AA |
| ivory-dark | 5.59 AA | 4.96 AA | 7.04 AAA | 8.18 AAA | **7.80 AAA** *(was 2.29 FAIL)* | 6.10 AA |
| ivory-light | 5.00 AA | 4.57 AA | 4.73 AA | 5.57 AA | 5.37 AA | 5.90 AA |
| midnight-dark | 5.22 AA | 4.65 AA | 8.60 AAA | 8.18 AAA | **9.68 AAA** *(was 1.97 FAIL)* | **6.04 AA** *(was 3.16 FAIL)* |
| midnight-light | 5.08 AA | 4.59 AA | 4.83 AA | 5.57 AA | 5.37 AA | 5.97 AA |

`limeWash` / `limeWash2` / `greenWash` / `redWash` keep their current hex values in every palette;
only the ink on them moved. Nothing about the tinted-card look changes.

## A.4 Non-text contrast — a new token, not a border overhaul

WCAG 1.4.11 requires **3:1** for a graphical object that is *the only* indicator of a control's
boundary or state. Measured today, on `--c-panel`:

| palette | `--c-line` | `--c-border` | `--c-border-strong` | `--c-border-mute` |
|---|---|---|---|---|
| terminal-dark | 1.31 | 1.71 | 2.27 | 4.38 ✓ |
| terminal-light | 1.23 | 1.47 | 1.82 | 2.99 |
| ivory-dark | 1.21 | 1.44 | 1.91 | 3.38 ✓ |
| ivory-light | 1.27 | 1.43 | 1.67 | 2.55 |
| midnight-dark | 1.22 | 1.46 | 1.88 | 3.31 ✓ |
| midnight-light | 1.28 | 1.53 | 1.90 | 2.92 |

Every text input in the app is `sInput` (`fleet/[id]/page.tsx:1427-1438`): `border: 1px solid
c.border`, no fill difference from its container in dark mode. **The border is the only thing that
says "this is a field", and it is at 1.4–1.7:1.** The v2 configuration editor and the ATG review
screen are almost entirely fields, so this must be fixed.

**Decision: add one token, `--c-border-field`, and leave the existing four alone.**

- `--c-line` / `--c-line-soft` — decorative dividers between rows and grid cells. Content on
  either side is independently perceivable. Exempt from 1.4.11. **Unchanged.** Raising these would
  destroy the fine engineering-hairline texture that is the brand's whole visual signature.
- `--c-border` — card and panel edges. Same exemption. **Unchanged.**
- `--c-border-strong` — secondary button edges. A secondary button also carries its own label, so
  the border is not the *only* indicator; but it is the affordance. **Unchanged for v2**, with
  `--c-border-field` available if a button ever loses its label.
- `--c-border-field` *(new)* — the boundary of `input`, `textarea`, `select`, the `Seg` track, the
  `Toggle` track and the checkbox box. Solved to **≥3.0:1 against all four surfaces — `bg`,
  `panel`, `panel-deep` and `hover`** in all six palettes (values in A.3.1–A.3.6). `hover` is in
  the set because a field inside a hovered list row (the schedule editor, the rule composer) is a
  real state, and the first draft of this token missed terminal-dark's `hover` at 2.99:1.

**Two mechanical steps the token needs, both easy to forget:**

1. **Declare it in the `:root` block too** (`globals.css:66-125`), not only in the six palette
   blocks. `globals.css:44-50` states the rule: `:root` carries terminal-dark and is the universal
   fallback, and every block declares the same token-name set. A token present in six blocks and
   absent from `:root` is exactly the copy-and-miss-a-line bug A.5 documents three instances of.
2. **Add it to `c` in `lib/theme.ts`**, beside `borderStrong`:

```ts
  /** Boundary of a FIELD — input, textarea, select, Seg track, Toggle track,
   *  checkbox. The only border token solved to WCAG 1.4.11's 3:1, because on a
   *  field the border is the sole indicator that a control is there (A.4).
   *  Do not use it for card or panel edges: c.border stays the quiet hairline. */
  borderField: "var(--c-border-field)",
```

Rejected alternative: raise `--c-border` globally to 3:1. It hits ~300 call sites, turns every card
into a boxed-in tile, and reads as a redesign. The narrow token is correct.

## A.5 Three latent bugs the audit found (fix in the same PR)

**1. `--c-green-ink: #ffffff` on a bright green fill — ivory-dark and midnight-dark.**
`app/globals.css:280` and `:404`. White text on `#5FBE82` = **2.29:1**; on `#46D08A` = **1.97:1**.
Terminal-dark got this right (`#0A0D12`, 11.17:1) and the other two dark palettes were copied
from the *light* blocks. Fix: `--c-green-ink: #1A1714` (ivory-dark, 7.80:1) and `#0A0F1E`
(midnight-dark, 9.68:1).

**2. `--c-ink: #FFFFFF` in midnight-dark.** `app/globals.css:402`. `--c-ink` is defined as "text
on a lime fill" (`lib/theme.ts:40`) — the primary CTA. White on `#5B8CFF` is **3.16:1**, and the
CTA label is 14px/700, which is *not* WCAG "large text" (that starts at 18.66px bold). Terminal
and ivory both use their own page ink. Fix: `--c-ink: #0A0F1E` → **6.04:1**. It also restores the
"bright fill, dark ink" gesture that is the same in the other two directions.

**3. Newsreader never loads its roman.** `app/layout.tsx:31-35` requests
`Newsreader({ subsets:["latin"], style:["italic"] })` — italic only. `--f-display` for the ivory
direction is `var(--font-serif), Georgia, serif` (`globals.css:310`, `:372`), used at
`font-style: normal`. The generated `@font-face` declares `font-style: italic`, so **every ivory
heading in the product currently renders in Georgia.** Fix: `style: ["normal","italic"]`.
This is a typeface bug, not a contrast bug, but it lands in the same file as the weight work.

## A.6 The font-weight token set

### A.6.1 What the four typefaces can actually do

| face | loader | axis / cuts available | notes |
|---|---|---|---|
| Space Grotesk | `app/layout.tsx:13-17`, no `weight` → variable | **wght 300–700 continuous** | `--f-display` for terminal + midnight |
| Instrument Sans | `:19-23`, no `weight` → variable | **wght 400–700 continuous** | `--font-sans`, the body face |
| IBM Plex Mono | `:25-30`, `weight: ["400","500"]` | **only 400 and 500 — static** | asking for 600 gets *synthetic* bold |
| Newsreader | `:31-35`, `style:["italic"]` | italic only (see A.5) | `--f-display` for ivory |

The mono constraint is the sharp edge: `w.monoStrong` requires adding `"600"` to that array. Do it
— IBM Plex Mono SemiBold is one extra subsetted file and the Activity page's run headers need it.

### A.6.2 The `w` export

Weights are **CSS custom properties**, not literals, for the same reason colours are: they must
re-resolve per context without every call site owning a media query. Specifically, they re-resolve
**per language** (A.6.4).

Add to `app/globals.css`, in the responsive token layer:

```css
:root {
  --w-body: 440;
  --w-medium: 560;
  --w-strong: 620;
  --w-display: 700;
  --w-mono-label: 500;
  --w-mono-strong: 600;
}
```

Add to `lib/theme.ts`, beside `r`:

```ts
/**
 * Font-weight tokens. Values live in app/globals.css so they can re-resolve
 * per language: Instrument Sans and Space Grotesk are variable (wght 400–700
 * and 300–700), but CJK falls back to a STATIC system family, where CSS
 * font-matching snaps any request in (400,500] straight to Medium. A 440 body
 * that reads as a crisper Latin stem reads as heavy, muddy 中文 at 13px — so
 * `html[lang]` steps the tokens back down for zh/zht/ja.
 *
 * `fontWeight` in csstype is `number | "bold" | "normal" | …`, with no string
 * escape hatch, so each token is cast the same way r.sidebarPos is.
 */
export const w = {
  /** Sans body copy, table cells, chat bodies, field values. */
  body: "var(--w-body)" as unknown as CSSProperties["fontWeight"],
  /** Emphasis inside copy; secondary buttons; chips; tab labels. */
  medium: "var(--w-medium)" as unknown as CSSProperties["fontWeight"],
  /** Sub-headings, stat values, table column headers, card titles. */
  strong: "var(--w-strong)" as unknown as CSSProperties["fontWeight"],
  /** Space Grotesk display headings and the primary CTA. */
  display: "var(--w-display)" as unknown as CSSProperties["fontWeight"],
  /** IBM Plex Mono labels/badges. Only 400/500/600 exist — never interpolate. */
  monoLabel: "var(--w-mono-label)" as unknown as CSSProperties["fontWeight"],
  /** IBM Plex Mono emphasis (run ids, active tab, selected filter). */
  monoStrong: "var(--w-mono-strong)" as unknown as CSSProperties["fontWeight"],
} as const;
```

### A.6.3 Which element uses which

| element | face | size | weight | colour |
|---|---|---|---|---|
| page title (`h1`) | `font.space` | 26–30 | `w.display` | `c.text` |
| section heading | `font.space` | 17–20 | `w.display` | `c.text` |
| card title | `font.space` | 15–17 | `w.strong` | `c.text` |
| stat value | `font.space` | 22–34 | `w.display` | `c.text` |
| body paragraph | `font.sans` | 13–15 | **`w.body`** | **`c.text2`** |
| helper / description | `font.sans` | 12–13 | `w.body` | **`c.muted`** |
| table cell | `font.sans` | 13 | `w.body` | `c.text2` |
| table column header | `font.mono` | 11 | `w.monoStrong` | `c.muted` |
| field label (`sLabel`) | `font.mono` | 11 | **`w.monoStrong`** | **`c.muted`** |
| field value (`sInput`) | `font.sans` | 14 | `w.body` | `c.text` |
| placeholder | `font.sans` | 14 | `w.body` | `c.faint` |
| badge / chip label | `font.mono` | 10–11 | `w.monoLabel` | per state |
| timestamp / ordinal | `font.mono` | 11–12 | `w.monoLabel` | `c.faint` |
| primary CTA | `font.space` | 14 | `w.display` | `c.ink` on `c.lime` |
| secondary button | `font.space` | 13 | `w.medium` | `c.text` |
| tab label (inactive) | `font.mono` | 12 | `w.monoLabel` | `c.muted` |
| tab label (active) | `font.mono` | 12 | `w.monoStrong` | `c.text` |
| nav row | `font.sans` | 13.5 | `w.medium` | `c.text2` / `c.text` active |

The single highest-leverage line in that table: **body paragraph moves from an implicit 400 to
`w.body` (440) and from `c.muted`/`c.faint` to `c.text2`.** That alone answers both halves of the
product owner's complaint.

### A.6.4 The CJK exception — why weights are tokens

CSS font matching for a **static** family, desired weight in (400, 500]: the spec checks weights
≥ desired and ≤ 500 first, ascending. So `font-weight: 440` on PingFang SC / Hiragino Sans /
Noto Sans CJK resolves to **Medium 500**, not to a 40-unit nudge. At 13px, 简体中文 at Medium on a
white ground is visibly heavier and muddier than Latin at 440, and 日本語 kanji lose counter
detail. So:

```css
/* Latin faces are variable; CJK falls back to a static system family where
   441–500 all snap to Medium. Step the sans tiers back down so 中文/日本語
   keeps its Regular stem while Latin keeps the crisper 440. */
html[lang^="zh"], html[lang^="ja"] {
  --w-body: 400;
  --w-medium: 500;
  --w-strong: 600;
}
```

**Both selectors are prefix matches, and the `ja` one has to be.** `BCP47` maps `ja` to the tag
`ja-JP`, so `html[lang="ja"]` — the obvious spelling, and the one this document carried in draft —
matches nothing the app ever writes, and every Japanese screen silently keeps the Latin 440. Use
`^=` for both, and let the contrast test assert that `ja-JP` and `zh-TW` resolve `--w-body` to 400.

This requires `document.documentElement.lang` to actually track the UI language.
`app/layout.tsx:62` hardcodes `lang="en"`. **Add to the store:** whenever `lang` changes (and in
`ThemeBoot`, pre-paint, from `localStorage[LANG_STORAGE_KEY]`, which is `"ark-lang"`), write
`document.documentElement.lang = BCP47[lang]` — `lib/i18n/index.ts:24-29` already has the map, and
`zh-CN` / `zh-TW` / `ja-JP` all match the `^=` selectors above. It is also simply correct HTML: screen
readers currently announce every Chinese and Japanese screen with an English voice.

### A.6.5 Migration — mechanical rules

Ordered by how safely a codemod can apply them.

1. `fontWeight: 700` → `w.display` **when** `fontFamily` is `font.space`; → `w.strong` otherwise.
   (119 sites. The `font.space` ones are headings and CTAs; the sans ones are over-heavy.)
2. `fontWeight: 600` → `w.strong`; `fontWeight: 500` → `w.medium`, except where `fontFamily` is
   `font.mono` → `w.monoLabel`. (43 sites.)
3. Any element with `fontFamily: font.mono` and `fontSize ≤ 12` that has **no** `fontWeight` →
   add `w.monoLabel`. (Mono at 400 in 10–11px is the thinnest thing in the product.)
4. `color: c.faint` where the node's text is a *sentence* (contains a space and ≥ 4 words) →
   `c.muted`. Cannot be safely automated; the list is 20 `hint`/`desc` props, enumerate them.
5. Body-copy nodes at `fontSize ≥ 13` with `color: c.muted` and no explicit `fontWeight` →
   `color: c.text2, fontWeight: w.body`.

Rule 5 is the one that changes the feel of the app. Do it deliberately, screen by screen, starting
with `app/dashboard/fleet/[id]/page.tsx`.

---

# B. TEMPLATE PAGE — `/dashboard/templates`

## B.0 What this page replaces

Today the only "template" surface is the role roster in the hire wizard
(`app/hire/page.tsx`, step 1): a paginated grid of tiles carrying `mono`, `name`, `blurb`, `hue`
and `minPlan` — five fields, all from `agent_roles`. It answers *"what job title?"* and nothing
else. A user cannot tell what the agent will actually do, whether their harness supports it,
what it will cost them in setup time, or whether anyone else has had success with it.

The v2 Template page reads `agent_templates` and answers all of those before the user commits.
`agent_roles` stays, but the relationship is **not** a column on the template: a template contains
1–3 `draft.roles[]`, each with a nullable `roleId` FK into `agent_roles` (null for a bespoke role
the generator composed). There is no `agent_templates.role_id`, so the card cannot show a role name
without opening `draft` — which is why the card shows `category` instead and the drawer shows the
roles.

## B.1 Layout envelope

Inside the dashboard shell (`app/dashboard/layout.tsx`, sidebar `--r-dash-grid: 236px 1fr`).
At 1440px viewport the content column is `1440 − 236 = 1204px`, less `--r-page-px` (40px) on each
side = **1124px usable**.

```
┌ 1440 ─────────────────────────────────────────────────────────────────────────────────┐
│┌ 236 ──────┐┌ 1204 ─────────────────────────────────────────────────────────────────┐ │
││  sidebar  ││ 40 │                    1124 usable                            │ 40   │ │
│└───────────┘└───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

New responsive token (H.1): `--r-gallery: repeat(auto-fill, minmax(320px, 1fr))`.
At 1124px with `gap: var(--r-gap-sm)` (20px) that resolves to **3 columns × 361px**.

## B.2 Header + control bar

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                      │  ← r.contentPy 36px
 │  Templates                                                    ┌──────────────────┐   │  font.space 30 / w.display / c.text
 │  Start from a proven setup, or describe what you need.        │ + Build with AI  │   │  font.sans 14 / w.body / c.text2
 │                                                               └──────────────────┘   │  c.lime fill, c.ink, w.display, h 42
 │                                                                                      │
 ├──────────────────────────────────────────────────────────────────────────────────────┤  1px c.line
 │ 14px                                                                                 │
 │ ┌─ 340 ──────────────────────┐ ┌ 150 ──┐┌ 150 ──┐┌ 150 ──┐    ┌ 168 ─────┐┌ 76 ────┐ │
 │ │ ⌕  Search templates…       │ │Harness▾││Category▾││Level ▾│    │ Sort ▾   ││ ▦  ☰  │ │
 │ └────────────────────────────┘ └───────┘└───────┘└───────┘    └──────────┘└────────┘ │
 │   h 38 · c.panelDeep · 1px c.border-field                                  view toggle│
 │ 12px                                                                                 │
 │ ┌ active filters ────────────────────────────────────────────────────────────────┐   │
 │ │ ⌫ OpenClaw   ⌫ Sales & Marketing   ⌫ Beginner            Clear all             │   │  chips: c.limeWash / c.accent / mono 11 / w.monoLabel
 │ └────────────────────────────────────────────────────────────────────────────────┘   │
 │ 8px                                                                                  │
 │  24 templates · sorted by Most used                                                  │  mono 11 / w.monoLabel / c.muted
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

**Controls, exactly.**

| control | type | values | default | persisted |
|---|---|---|---|---|
| search | debounced 250ms text | `ILIKE` over `name`, `summary` and `tags` — the three indexed columns. `%`, `_` and `\` escaped as `app/api/admin/users/route.ts:27` does | `""` | URL `?q=` |
| Harness | multi-select popover | OpenClaw · Hermes · Codex Harness · DeepSeek Harness · **Any harness** | Any | URL `?harness=` |
| Category | multi-select popover | the **11** `TemplateCategory` values — `sales · marketing · support · operations · finance · people · legal · engineering · research · personal · other` (`docs/AGENT_TEMPLATE_GENERATOR.md` §3.2) | all | URL `?category=` |
| Plan | single-select | Associate · Professional · Director — filters on `min_plan` | all | URL `?plan=` |
| Sort | single-select | Most used (`use_count`) · Newest (`created_at`) · Recently updated (`updated_at`) · A–Z (`name`) | Most used | URL `?sort=` |
| Scope | segmented | All · **Your workspace** · Public | All | URL `?scope=all\|workspace\|public` |
| view | icon pair `▦` grid / `☰` list | — | grid | **`localStorage["ark-view:templates"]`** |

**The category taxonomy is *not* the skill taxonomy.** `skills.category` is the 16-value
`skill_category` pgEnum from `docs/research/SKILL_ECOSYSTEM.md` §B; `agent_templates.category` is
`varchar(24)` holding one of the 11 `TemplateCategory` values above. They are different vocabularies
over different objects and must have separate `Record<Lang, Record<Enum, string>>` label maps. An
earlier draft of this document filtered templates by the skill taxonomy; that filter would have
matched nothing.

**`scope` is the only cross-tenant read in the product** and its contract is already fixed by
`docs/AGENT_TEMPLATE_GENERATOR.md` §9.4: `scope=public` returns `TemplateSummaryDTO`s from other
workspaces and nothing else; `GET /api/templates/{id}` serves another tenant's full `draft` only
when `visibility = 'public'`; `PATCH` and `DELETE` on a template you do not own are **404, never
403**. Every human-visible string in a `public` template is third-party text — see B.9.

**Why the view toggle is `localStorage` and not Postgres.** It is a per-viewer, per-device
reading preference; no backend service consumes it, so it does not fall under the "everything the
backend needs lives in Postgres" rule. Read it in a `useEffect` after mount and default to grid on
the server render, so SSR and hydration agree.
*Rejected: `users.prefs` JSONB — a round-trip and a migration to remember which icon was pressed.*

Every other control lives in the URL so a filtered gallery is linkable and the back button works.

## B.3 Card view

```
 ┌ 361 ─────────────────────────────────────────────────────┐
 │ 18px pad                                          18px   │   card: bg c.panel · 1px c.border · r.radiusMd
 │  ┌────┐  Inbound Lead Qualifier          ╭──────────╮    │   hover: borderColor c.borderMute, translateY(-1px)
 │  │ P  │  font.space 16 / w.strong / text ╰ OPENCLAW ╯    │   glyph 38×38, bg roleHue, color c.onBrand, w.display 16
 │  └────┘  Prospector · Sales & Marketing                  │   mono 11 / w.monoLabel / c.muted
 │          ↑ font.sans 12.5 / w.body / c.muted             │   harness pill: 1px c.border, mono 10, w.monoLabel, harness hue
 │ 14px                                                     │
 │  Watches your inbound forms, researches each             │   ← agent_templates.summary, 2 lines, .ark-clamp
 │  company, scores the lead and drafts a first reply.      │   font.sans 13.5 / w.body / c.text2  · line-height 1.5
 │ 14px                                                     │
 │  ┌ skills ──────────────────────────────────────────┐    │
 │  │ web-research  crm-sync  email  lead-enrichment +3│    │   chips: mono 10.5 / w.monoLabel / c.muted
 │  └──────────────────────────────────────────────────┘    │   1px c.line, pad 3×7, radius r.radiusSm
 │ 14px                                                     │
 │  ┌────────────┬────────────┬────────────┐                │   metric strip: 1px c.line box, 3 equal cells
 │  │ LEVEL      │ SETUP      │ USED BY    │                │   label mono 10 / w.monoLabel / c.muted
 │  │ Beginner   │ ~6 min     │ 1,204      │                │   value font.space 14 / w.strong / c.text
 │  └────────────┴────────────┴────────────┘                │   h 52
 │ 12px                                                     │
 │  ◷ Weekdays 08:30 · every 15 min during hours            │   mono 11 / w.monoLabel / c.faint  ← sample schedule
 │ 14px                                                     │
 │  ┌───────────────────────────┐ ┌──────────────────────┐  │
 │  │  Start from this template │ │       Preview        │  │   primary: c.lime/c.ink/w.display/13/h 38
 │  └───────────────────────────┘ └──────────────────────┘  │   secondary: transparent/1px c.borderStrong/c.text/w.medium
 │ 18px                                                     │
 └──────────────────────────────────────────────────────────┘
   total height 330px (fixed; `summary` clamps to 2 lines via .ark-clamp so the grid stays even)
```

**Card fields → columns.** Every cell above is a stored column on `agent_templates`
(`docs/AGENT_TEMPLATE_GENERATOR.md` §7.1). **The gallery never opens `draft`** — it is 10–40 KB and
24 of them is a 1 MB response, which is why §7.1 denormalises the counts in the first place.

| shown | column | notes |
|---|---|---|
| glyph, hue | `agent_templates.mono`, `.hue` | on the template itself, **not** joined from `agent_roles`. `mono` is `varchar(8)` (a ZWJ emoji is >2 code points); `Array.from(mono)[0]` is what renders |
| name | `agent_templates.name` (`varchar(60)`) | |
| category | `agent_templates.category` | 11-value `TemplateCategory`, labelled from `lib/i18n/templates.ts` |
| locale badge | `agent_templates.locale` | a `zh` template shown to an `en` viewer is labelled, never machine-translated (§7.1) |
| harness pill | `agent_templates.harness` | the column is `harness`; its **type** is the `engine` pgEnum. Do not write `agent_templates.engine` — there is no such column |
| "what it does" | `agent_templates.summary` (`varchar(200)`) | one line, authored by the generator in `locale`. There is no `automates` column and one must not be added: `summary` already carries exactly this string |
| skills | `agent_templates.skill_count` | a count, not a preview. The four skill chips shown in the wireframe would need `draft`; see below |
| SETUP | `agent_templates.agent_count` + `.schedule_count` | rendered as e.g. `1 agent · 2 schedules`. **There is no `time_to_value_minutes` column and no `difficulty` column**; both were invented by an earlier draft of this document |
| BUDGET | `draft.meta.estimatedCreditsPerMonth` | the one genuinely useful pre-commit number §3.2 already computes — but it lives inside `draft`, so it must be denormalised to a column if the card is to show it |
| USED BY | `agent_templates.use_count` | the column is `use_count`, not `install_count` |
| min plan | `agent_templates.min_plan` | see the plan gate below |
| updated | `agent_templates.updated_at` | |

**Two card cells need a migration or they must be dropped from the card.** `LEVEL` and the
four-skill chip preview have no backing column, and deriving either at render time means reading
`draft` for every tile. Pick one, in this order of preference:

1. **Drop them.** The metric strip becomes `AGENTS · SKILLS · USED BY`, all three from denormalised
   counts, and the skill chips move to the drawer, which reads `draft` anyway.
2. **Add two generated columns** in the same migration that creates the table:
   `skill_preview jsonb NOT NULL DEFAULT '[]'` (first 4 `publicId`s, written by the same code that
   writes `skill_count`) and `est_credits_per_month integer NOT NULL DEFAULT 0`.

Whichever is chosen, the rule stands: **the card must never run a summariser or read `draft`.** A
per-tile LLM call is a per-request LLM call, and the app must work with no key.

**Sample schedule.** `draft.schedules[0]` humanised by `lib/schedule/describe` — also inside
`draft`, so on the card it is subject to the same rule. It belongs on the drawer, not the card,
unless a `sample_schedule` column is added.

**Badges.** There is no `agent_templates.source` column. The two signals that exist are
`visibility` (`private` \| `workspace` \| `public`) and `origin` (`generated` \| `manual` \|
`seeded` \| `forked`). The card renders: `⬦ PUBLIC` in `c.amber` when the row belongs to another
workspace and `visibility = 'public'`; `⬦ YOURS` in `c.accent` when `workspace_id` equals the
viewer's; nothing at all for a platform template (`workspace_id IS NULL`) — absence is the
strongest signal and keeps the card quiet.

**Plan gate.** `min_plan` above the workspace's tier renders the primary button as
`Upgrade to start` (secondary style, links to `/dashboard/billing`) with the tier name in the
metric strip. Hiding the template would be worse: `POST /api/templates/{id}/materialize` returns
`402` for a plan shortfall (§9.4), so a card that offers a button the API will refuse is a
guaranteed dead end.

## B.4 List view

Same data, denser, sortable by clicking a header. Row height 56px, zebra off, `1px c.lineSoft`
divider, whole row is the click target for the drawer.

```
 ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
 │ TEMPLATE                    CATEGORY     HARNESS  AGENTS SKILLS  SCHED  USED BY  UPDATED   │ ← mono 11 / w.monoStrong / c.muted
 ├──────────────────────────────────────────────────────────────────────────────────────────────┤   1px c.line, sticky under the control bar
 │ ┌──┐ Inbound Lead Qualifier  Sales        OpenClaw    1      7      2     1,204   3d ago  ⋯  │
 │ │P │ Scores + drafts replies                                                                 │ ← summary line, font.sans 12 / c.muted
 │ └──┘                                                                                         │
 ├──────────────────────────────────────────────────────────────────────────────────────────────┤
 │ ┌──┐ Weekly Revenue Digest   Finance      Hermes      1      4      1       882   1w ago  ⋯  │
 │ │O │ Pulls the numbers, writes the note                                                      │
 │ └──┘                                                                                         │
 └──────────────────────────────────────────────────────────────────────────────────────────────┘
   9 tracks, `column-gap: 12px` (8 gaps = 96px). Fixed tracks sum to 672px, so at 1124px usable
   TEMPLATE resolves to 1124 − 672 − 96 = **356px**:
       minmax(0,1fr)→356 · 120 · 116 · 72 · 84 · 68 · 84 · 88 · 40
```

- Sortable headers: TEMPLATE, USED BY, UPDATED. `aria-sort` on the active one. **Only columns
  backed by a sortable stored column are sortable** — `GET /api/templates` accepts `sort` from a
  fixed allowlist (§9.4) and an arbitrary column name in a query param is an injection surface,
  so the client must not invent one.
- `⋯` opens a `MenuPopover` (already exists, `components/MenuPopover.tsx`) with
  *Preview · Start from this · Duplicate to my workspace · Copy template id*. **Duplicate** is
  `POST /api/templates/{id}/fork`, which resets `visibility='private'`, `origin='forked'`,
  `use_count=0` and re-runs `lint()` — a fork of another tenant's template is an import of
  third-party content, not a copy.
- Below `1024px` the list view **drops** the AGENTS, SCHED and UPDATED columns via the
  `--r-tpl-cols` token (H.2); below `640px` the list view is not offered at all and the toggle is
  hidden by `display: var(--r-desktop-nav)` — the existing token that is `flex` on desktop and
  `none` at ≤640px (`globals.css:546`). No new class is needed.

## B.5 Detail drawer

Right-anchored, `width: min(720px, 100vw)`, matching the existing `InstanceInfoDrawer`
(`fleet/[id]/page.tsx:2660-2690`): `role="dialog"`, `aria-modal="true"`, scrim `c.scrim`,
`borderLeft: 1px c.border`, `background: c.panel`, `zIndex: 51`.

```
 ┌ min(720, 100vw) ────────────────────────────────────────────────┐
 │ ┌──┐ Inbound Lead Qualifier                    ╭ OPENCLAW ╮ [✕] │  header, 22px pad, 1px c.line under
 │ │P │ Sales · written in English · Professional plan             │
 │ └──┘ 1 agent · 7 skills · 2 schedules · used by 1,204 workspaces│  mono 11 / w.monoLabel / c.muted
 ├─────────────────────────────────────────────────────────────────┤
 │  Watches your inbound forms, researches each company, scores    │  font.sans 14 / w.body / c.text2
 │  the lead against your ICP and drafts a first reply for review. │
 ├─────────────────────────────────────────────────────────────────┤
 │  ▸ ROLES                                              1 role    │  ← the six sections, collapsible
 │  ▾ AGENTS                                           1 agent     │     header: mono 11 / w.monoStrong / c.muted
 │      ┌───────────────────────────────────────────────────────┐  │     count: mono 11 / c.faint, right-aligned
 │      │ Prospector · autonomy "ask" · tone professional       │  │
 │      │ escalates to the workspace owner above $300           │  │
 │      └───────────────────────────────────────────────────────┘  │
 │  ▾ SKILLS                                          7 skills     │
 │      web-research  ● low     crm-sync       ● medium            │  risk dot: c.green / c.amber / c.red
 │      email         ● low     lead-enrichment ● medium           │  name mono 12 / w.monoLabel / c.text2
 │      … 3 more                                                   │
 │  ▾ RULES & BOUNDARIES                              5 rules      │  ← draft.boundaries
 │      · Never quote a price without approval                     │  font.sans 13 / w.body / c.text2
 │      · Never email a domain on the suppression list             │  bullet c.accent
 │  ▾ CONTEXT                                        3 items       │
 │      ▤ ICP definition.md        text  · 1.2 KB                  │  mono 11.5 / c.muted
 │      ▤ objection-handling.pdf   file  · 240 KB                  │  kind ∈ file | text | url
 │      ▤ acme.com/pricing         url                             │  rendered as TEXT, never a link
 │  ▾ REMINDERS & SCHEDULERS                       2 schedules     │
 │      ◷ Weekdays 08:30 Asia/Singapore  — morning sweep           │  mono 12 / w.monoLabel / c.text2
 │      ◷ Every 15 min, 09:00–17:45 Mon–Fri — inbox poll           │
 ├─────────────────────────────────────────────────────────────────┤
 │  PROVENANCE                                                     │  mono 11 / w.monoStrong / c.muted
 │  Published by ArkAgent · updated 3 days ago · slug lead-qualify │  mono 11 / c.faint
 ├─────────────────────────────────────────────────────────────────┤  sticky footer, c.glass, 1px c.line above
 │  ┌───────────────────────────────┐ ┌──────────────────────────┐ │
 │  │  Start from this template  →  │ │  Duplicate & edit        │ │  h 44
 │  └───────────────────────────────┘ └──────────────────────────┘ │
 └─────────────────────────────────────────────────────────────────┘
```

Sections use native `<details>`/`<summary>` so the disclosure keyboard contract and the
`aria-expanded` state come from the platform rather than being re-implemented. ROLES and AGENTS
default open; the rest default closed on mobile and open on desktop.

## B.6 "Start from this template" — the CTA contract

Pressing it does **not** create an agent. It routes to
`/hire?template=<id>` and the hire wizard opens **pre-filled** at step 2 (Brief) with a banner:

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │ ◆  Starting from "Inbound Lead Qualifier".  7 skills, 5 rules and 2  │  c.limeWash bg · 1px c.limeBorder
 │    schedules are already set. Change anything you like.  [Clear]     │  font.sans 13 / w.body / c.text2
 └──────────────────────────────────────────────────────────────────────┘
```

Rationale: creating an agent is a billable, VM-provisioning act. A gallery click must never be it.
*Rejected: one-click instantiate with an undo toast — provisioning is not undoable within the toast
window (see `docs/research/RUNTIME_INTEGRATION.md` §1.3 E2).*

Materialisation happens on wizard submit through the endpoint that already owns it:
**`POST /api/templates/{id}/materialize`** (`docs/AGENT_TEMPLATE_GENERATOR.md` §9.4), which writes
`agents`, `agent_skills`, `agent_context_items` and `agent_schedules` in one transaction via
`lib/atg/materialize`. Three things the client must get right, none of them optional:

- **`Idempotency-Key` is a required header.** Without it the endpoint returns `400`. Mint one uuid
  per wizard session and reuse it across retries, or a double-click provisions two VMs.
- **`402` is a plan shortfall.** Render the upgrade path, not a generic error (B.3 plan gate).
- **`409` is a precondition the user can fix**, and the body names which: a skill went `blocked`
  since the template was published, a lint warning needs acknowledging (`acknowledgedWarnings`),
  a pinned version disappeared, or the harness is incompatible. Each gets its own inline card
  above the submit button with the specific item named. **Never retry a `409` automatically** —
  every one of them means the agent the user is about to create differs from the one they read.
- **`500 { error, stage }`** names the materialisation stage that failed; show the stage.

## B.7 Empty states — three of them, and they are different

**B.7.1 No templates exist at all** (fresh install, catalogue not seeded):

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │                              ▦                                       │  glyph 34, c.faint
 │                   No templates yet                                    │  font.space 18 / w.display / c.text
 │       Describe the job in your own words and we will draft            │  font.sans 14 / w.body / c.muted
 │       the whole setup — role, skills, rules and schedule.             │
 │                    ┌────────────────────┐                            │
 │                    │  Build with AI  →  │                            │  c.lime primary
 │                    └────────────────────┘                            │
 └──────────────────────────────────────────────────────────────────────┘
```

**B.7.2 Filters match nothing:** same frame, copy *"No templates match these filters."*, primary
button is **Clear filters** (secondary style), plus a line *"Or describe what you need →"*.
Never show the AI CTA as the primary here; the user's intent was to browse.

**B.7.3 Scope = "Your workspace" and there are none:** copy *"You haven't saved a template yet.
Any agent you build can be saved as one from its configuration page."* with a link to
`/dashboard/fleet`. This is the only empty state that teaches a feature.

**B.7.4 The list is stale or the request failed.** `GET /api/templates` can return `422` (a filter
value the allowlist rejects — recoverable by clearing filters) or fail outright. An error state is
not an empty state: render the frame with `⚠`, the message, and `[ Try again ]`, and **keep the
control bar populated** so the user can see and change what they asked for.

## B.9 Third-party template text is DATA

Any row whose `workspace_id` is not the viewer's — every `scope=public` result, every forked
source — carries strings written by another tenant: `name`, `summary`, `description`, every rule,
every skill rationale, every schedule prompt. `docs/AGENT_TEMPLATE_GENERATOR.md` §9.4 fixes the
rule and this page is where it is enforced:

- Render every one of them as a **text node**. No `dangerouslySetInnerHTML`, no markdown renderer,
  no `<a href>` built from a template string. The CONTEXT drawer row for `kind: "url"` shows the
  URL as text and does **not** link it.
- Do not let template text reach a prompt as an instruction. The AiHelp panel (C.4) serialises the
  draft the user is looking at; that payload is fenced as `<template_draft>` … `DATA_NOT_INSTRUCTIONS`
  exactly as §4.1 fences the user's brief, and the injection scan of §6.4 has already run on
  publish (`POST /api/templates` with `visibility: 'public'` refuses on an `error` finding).
- The `⬦ PUBLIC` badge is not decoration. It is the only thing on the card that tells the user
  the words they are reading were written by a stranger.

## B.10 `TemplateSummaryDTO` / `TemplateDetailDTO`

**`TemplateSummaryDTO` already exists.** `docs/AGENT_TEMPLATE_GENERATOR.md` §9.4 fixes it, and
`lib/serializers.ts` can hold exactly one type with that name. This section does not redefine it;
it states it, and names the two fields the gallery needs added — with the columns that must back
them.

```ts
// lib/serializers.ts — the shape ATG §9.4 already specifies. Deliberately NOT `draft`,
// which is 10–40 KB; a 24-card gallery carrying it is a 1 MB response.

export type Harness = "openclaw" | "hermes" | "codex" | "deepseek";
export type TemplateCategory =
  | "sales" | "marketing" | "support" | "operations" | "finance"
  | "people" | "legal" | "engineering" | "research" | "personal" | "other";
export type TemplateVisibility = "private" | "workspace" | "public";
export type TemplateOrigin = "generated" | "manual" | "seeded" | "forked";

export interface TemplateSummaryDTO {
  id: string;
  slug: string;
  name: string;
  /** agent_templates.summary, varchar(200). The card's one-line "what it does". */
  summary: string;
  category: TemplateCategory;
  tags: string[];
  /** varchar(8) — may be a multi-code-point emoji. Render Array.from(mono)[0]. */
  mono: string;
  hue: string;
  /** The language the strings above are WRITTEN in. Never machine-translated. */
  locale: Lang;
  harness: Harness;
  minPlan: PlanTier;
  skillCount: number;
  scheduleCount: number;
  agentCount: number;
  useCount: number;
  materializable: boolean;
  visibility: TemplateVisibility;
  updatedAt: string;             // ISO

  // ---- Added by this design. Each needs a denormalised column; see B.3. ----
  /** agent_templates.origin — drives the ⬦ PUBLIC / ⬦ YOURS badge together with
   *  ownership. There is no `source` column and none should be added. */
  origin: TemplateOrigin;
  /** True when workspace_id === the caller's workspace. Computed in the
   *  serializer, never stored — the same row is "yours" to one tenant and
   *  "public" to another, so it cannot be a column. */
  ownedByViewer: boolean;
}
```

**`TemplateDetailDTO` is the full row plus `draft`.** ATG §9.4 already returns it as
`{ template: TemplateDTO }` from `GET /api/templates/{id}`. The drawer renders
`draft: AgentTemplateDraft` (§3.1) directly — do not re-key it into a parallel `sections` object,
which is how the two documents drift. The section names on screen map to draft keys as:

| drawer section | draft key | count shown |
|---|---|---|
| ROLES | `draft.roles` (1..3) | `roles.length` |
| AGENTS | `draft.agents` (1..3) | `agents.length` |
| SKILLS | `draft.skills` (0..12) | `skills.length` |
| RULES & BOUNDARIES | **`draft.boundaries`** — *not* `rules* | `boundaries.rules.length` |
| CONTEXT | `draft.context` (0..8) | `context.length` |
| REMINDERS & SCHEDULERS | `draft.schedules` (0..8) | `schedules.length` |

Plus `draft.meta` (name, summary, description, category, tags, mono, hue, minPlan,
`estimatedCreditsPerMonth`) for the header, and `draft.provenance` (mode, stages, warnings,
`materializable`, `injectionFindings`) for the PROVENANCE block. The six product sections named by
the product owner are the six draft keys above — `boundaries` is the RULES & BOUNDARIES section
under a different name, not a seventh thing.

**Three fields an earlier draft of this document invented and that do not exist anywhere:**
`automates` (use `summary`), `difficulty` / `timeToValueMinutes` (no column, no generator output —
see B.3 for the two ways out), `installCount` (it is `useCount`), `version` (there is
`draft_schema_version`, which is a schema version and must not be shown as "v4"), and
`publisher: { handle, verified }` (templates have `created_by_id` and a workspace, not a
publisher handle — that concept belongs to `skills`).


# C. THE AI-GUIDED CREATION FLOW

Three screens in sequence, all under `/hire`, all reachable without a template:

```
   C.1 DESCRIBE            C.2 GENERATING              C.3 REVIEW & EDIT          →  step 3/4 of
   "what do you need?"  →  live SSE stage list      →  six editable sections         the existing
   free text + nudges      /api/templates/generate     + validation gutter           hire wizard
```

The existing 4-step wizard (`app/hire/page.tsx`) is **not replaced**. C.1–C.3 become an alternate
entry that lands the user in the wizard's step 2 with everything pre-filled. A user who knows
exactly what they want still picks a role tile and types a brief, as today.

## C.1 DESCRIBE — the blank-page screen

The hardest screen in the product: the user does not know what an agent is for. So the page never
shows an empty box alone.

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │                                                                                      │
 │   What should this employee take off your plate?                                     │  font.space 30 / w.display / c.text
 │   Write it the way you'd explain it to a new hire. We'll do the rest.                │  font.sans 15 / w.body / c.text2
 │                                                                                      │
 │  ┌────────────────────────────────────────────────────────────────────────────────┐  │
 │  │  Every morning, check the shared inbox for new enquiries, look up the          │  │  textarea
 │  │  company, and draft a reply for me. Don't ever quote a price.                  │  │  min-h 148 · font.sans 15 / w.body
 │  │                                                                                │  │  bg c.panelDeep · 1px c.border-field
 │  │                                                                                │  │  focus: 1px c.accent + ring (see I.1)
 │  │                                                                        142/2000│  │  counter mono 11 / w.monoLabel / c.faint
 │  └────────────────────────────────────────────────────────────────────────────────┘  │
 │                                                                                      │
 │  Not sure? Start from one of these —                                                 │  font.sans 13 / w.body / c.muted
 │  ┌────────────────────┐┌────────────────────┐┌────────────────────┐┌───────────────┐ │
 │  │ Qualify my inbound ││ Chase unpaid       ││ Summarise my week  ││ Watch a       │ │  "seed" chips
 │  │ leads              ││ invoices           ││ from Slack         ││ competitor    │ │  1px c.border · c.text2 · 13 / w.medium
 │  └────────────────────┘└────────────────────┘└────────────────────┘└───────────────┘ │  hover: c.limeWash + c.limeBorder
 │                        clicking one FILLS the textarea, it does not submit           │  h 56 · radius r.radiusMd
 │                                                                                      │
 │  ┌ optional, collapsed by default ─────────────────────────────────────────────────┐ │
 │  │ ▸ Add detail (harness, working hours, channels, files)                         │ │  <details>
 │  └─────────────────────────────────────────────────────────────────────────────────┘ │
 │                                                                                      │
 │                                          ┌──────────────────────────────────────┐    │
 │                                          │  Draft my agent  →                   │    │  c.lime · c.ink · w.display 15 · h 48
 │                                          └──────────────────────────────────────┘    │  disabled until >= 20 chars
 └──────────────────────────────────────────────────────────────────────────────────────┘
   content column: max-width 720px, centred. Below 640px: full width, seed chips stack 1-up.
```

The four seed chips are **not** hardcoded English strings: they come from `lib/i18n/atg.ts` in all
four languages and are re-ordered per workspace by `agent_templates.use_count` within the
workspace's most-used category, falling back to a fixed order for a brand-new workspace.

## C.2 GENERATING — the SSE stage list

`POST /api/templates/generate` returns `text/event-stream`. The screen is a stage ledger, not a
spinner, because generation takes 12–40s with a key and ~400ms without one, and the user needs to
see which section is being written.

**Transport, precisely.** `EventSource` cannot issue a POST, so this is `fetch()` + a
`ReadableStream` reader, and the abort path is `AbortController` — which is also what makes
`Cancel` work. The route sends a `: ping` comment frame every 15s (§9.1) because there is a 10–20s
gap between the `skills` stage's database work and the `boundaries` stage's first token, long
enough for an intermediary to close an idle connection.

**Event contract — already fixed by `docs/AGENT_TEMPLATE_GENERATOR.md` §9.1. Do not restate it
differently here.** The frames are `type`-tagged in the data payload (not SSE `event:` names,
because a fetch reader has to parse them either way and one shape is cheaper):

```ts
type GenerateEvent =
  | { type: "start"; generationId: string; mode: "llm" | "hybrid" | "deterministic"; stages: StageId[] }
  | { type: "stage"; stage: StageId; index: number; total: number; label: string }
  | { type: "stage_done"; stage: StageId; outcome: StageOutcome; durationMs: number }
  | { type: "section"; section: "meta" | "roles" | "skills" | "boundaries" | "context" | "schedules"; value: unknown }
  | { type: "warning"; warning: DraftWarning }
  | { type: "done"; generationId: string; status: "ready" | "needs_review"; draft: AgentTemplateDraft }
  | { type: "error"; message: string; code: string; generationId: string | null };
```

Three consequences the UI must respect:

- **`mode` has three values, not two.** `hybrid` — some stages ran on a model, some fell back — is
  the common case when one call times out, and it must not render as either extreme. Banner copy
  for all three is in C.2.1.
- **`label` is English and is for logs only.** The screen renders `t.stages[stage]` from the
  dictionary. Never display `label`.
- **`stages` arrives in the `start` frame.** The list is server-driven; the client renders whatever
  ids it is given, in order, so adding a stage upstream does not need a client release.

**The ten stages** — the ids and labels are `docs/AGENT_TEMPLATE_GENERATOR.md` §2 and §9.2, and
they are the definition. An earlier draft of this document listed eight stages of its own invention
(`understand`/`roles`/`agents`/`rules`/`validate`); none of those ids exist.

| # | stage id | label (en) | streams a section |
|---|---|---|---|
| 1 | `intake` | Reading your brief | — (deterministic, no model) |
| 2 | `charter` | Defining the job | `meta`, `roles` |
| 3 | `capabilities` | Working out what it needs | — |
| 4 | `skills` | Choosing tools | `skills` |
| 5 | `boundaries` | Setting the rules | `boundaries` |
| 6 | `context` | Listing what to give it | `context` |
| 7 | `schedules` | Planning its rhythm | `schedules` |
| 8 | `assemble` | Putting it together | — |
| 9 | `lint` | Safety check | — |
| 10 | `finalize` | Finishing up | — |

**There is no AGENTS stage and no `agents` section frame.** `draft.agents` is produced inside
`charter`/`assemble` and arrives whole in the `done` frame. C.3's AGENTS card therefore renders a
skeleton until `done`, not until a section frame that never comes.

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │  Drafting your agent                                                                 │  font.space 24 / w.display
 │  “Every morning, check the shared inbox…”                                            │  font.sans 13 / w.body / c.muted, 1 line clamp
 │                                                                                      │
 │  ┌────────────────────────────────────────────────────────────────────────────────┐  │
 │  │ ✓  Reading your brief                                                    0.4s  │  │  done:    ✓ c.green · label c.text2
 │  │ ✓  Defining the job                      Prospector                      1.2s  │  │  result:  mono 12 / w.monoLabel / c.accent
 │  │ ✓  Working out what it needs             6 capabilities                  2.9s  │  │  timing:  mono 11 / c.faint
 │  │ ◐  Choosing tools                                                              │  │  active:  ◐ c.accent, `animation: pulse 1.2s`
 │  │ ·  Setting the rules                                                           │  │  pending: · c.faint · label c.faint
 │  │ ·  Listing what to give it                                                     │  │
 │  │ ·  Planning its rhythm                                                         │  │
 │  │ ·  Putting it together                                                         │  │
 │  │ ·  Safety check                                                                │  │
 │  │ ·  Finishing up                                                                │  │
 │  └────────────────────────────────────────────────────────────────────────────────┘  │
 │     row h 40 · divider 1px c.lineSoft                                                │
 │                                                                                      │
 │  ▬▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  4 / 10        4,210 tok · $0.0018  │  2px bar, c.lime on c.line
 │                                                                                      │  cost: mono 11 / c.faint
 │                                                     ┌────────────────┐               │
 │                                                     │     Cancel     │               │  aborts the fetch (AbortController)
 │                                                     └────────────────┘               │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

**The stage rows carry no `detail` line.** The `stage` frame has `stage`, `index`, `total`, `label`
and nothing else; there is no per-stage `detail` string to render, so the row is a fixed 40px and
`StageList`'s `detail` prop exists only for the deterministic path's one-line explanations.

**Cost is shown, and this is not optional.** §9.5 spends the workspace's generation budget and §9.3
says plainly that a hidden meter is a support ticket. Render the running
`cost.promptTokens + cost.completionTokens` and `costMicroUsd` beside the progress bar, formatted
through the existing currency machinery.

**Cancel does not keep a draft.** §9.1: on abort the `template_generations` row moves to
`canceled` and the stream closes; `draft` is null while a generation is running, so there is
nothing to keep. The button's confirmed behaviour is *"Stop and go back"*, returning to C.1 with
the brief still in the textarea. Saying "keeps the draft" would promise something the API does not
do.

**Three pre-stream errors need their own screens**, because they arrive as ordinary JSON before a
single frame and the stage ledger never renders (§9.1):

| status | screen |
|---|---|
| `409` | *"A draft is already being generated for this workspace."* + `[ Open it ]` linking to `/hire?generation=<id>`, which resumes the stream by polling `GET /api/templates/generations/{id}`. Never a bare error. |
| `429` | *"You've generated a lot today."* with the concrete `retryAfterSeconds` counted down live and the `limit` named (`hour` \| `day` \| `cost`). A `cost` limit additionally offers `[ See usage ]`. |
| `422` `IntakeFacts.tooThin` | Return to C.1 with the textarea focused and an inline hint under it — *"Tell us a bit more about what you need"* — **not** a modal. The user's next act is typing. |

**And one after the stream opens:** an `{ type: "error" }` frame arrives on an HTTP 200 that cannot
be changed. Keep the completed stages on screen, mark the failed one `✕`, and offer
`[ Try again ]` (a fresh POST) and `[ Start over ]`. Do not clear the ledger — the stages that
succeeded are what tells the user how far it got.

**Polling is a supported transport, not a fallback nobody built.** §9.3: `stream: false` returns
`202 { generationId, pollAfterMs }` and the client polls `GET /api/templates/generations/{id}`,
whose `progress: { stage, index, total }` and `stageTraces[]` render the *same* `StageList`. Use it
when `EventSource`-style streaming is buffered by a proxy or the tab is backgrounded on mobile. The
screen must not have two layouts for the two transports.

Sections stream into C.3 **as they complete** — the user can start editing ROLES while SKILLS is
still generating. The still-generating cards render a skeleton with the same height as their
finished form, so nothing reflows underneath the cursor.

### C.2.1 With no LLM key, and with `AGENT_MANAGER_MODE != "live"`

**No `OPENROUTER_API_KEY` (or the provider is down):** `lib/atg/pipeline` runs its deterministic
path. Role is matched by keyword against `agent_roles`; skills by scoring the brief's tokens
against `skills.name`/`description`/`category`; rules come from a fixed per-role rule bank plus
any explicit "never/always/don't" clause lifted verbatim from the brief; context items are
extracted URLs and any explicit noun phrases after "using"/"from"; schedules are parsed by
`lib/schedule/cron.ts` + `lib/schedule/fromNaturalLanguage` from time expressions
("every morning" → `30 8 * * 1-5`). The **exact same ten stages render** — they just complete in
~400ms, and the header carries one of three banners, keyed on the `start` frame's `mode`:

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ ◆ Drafted from rules, not a model. No AI provider is configured, so this is a         │  mode: "deterministic"
 │   keyword-and-template draft. Everything below is editable.          [Learn more]     │  c.limeWash · 1px c.limeBorder
 ├──────────────────────────────────────────────────────────────────────────────────────┤  font.sans 13 / w.body / c.text2
 │ ◆ Two steps fell back to rules — Choosing tools, Planning its rhythm. Those sections  │  mode: "hybrid"
 │   are keyword-matched rather than reasoned. Everything is editable.                   │  same styling; names the stages
 └──────────────────────────────────────────────────────────────────────────────────────┘
   mode: "llm" — no banner at all.
```

The banner is informational, **never blocking**, and never uses `c.red` — a rule-based draft is a
supported product state, not a degradation the user caused. `hybrid` names the specific stages
(from `stageTraces[].engine`) because "partly AI" with no detail is worse than either extreme.

**`AGENT_MANAGER_MODE != "live"`:** generation is unaffected (it never touches the Manager). What
changes is C.3's SKILLS section: `harnessCompatible` cannot be verified against a real runtime, so
every skill row shows `⚠ unverified` in `c.muted` instead of a green tick, and the wizard's final
step shows the existing simulator notice. Per `docs/research/RUNTIME_INTEGRATION.md` §4.1, the
mode must resolve to `unconfigured` when unset in production rather than silently simulating.

## C.3 REVIEW & EDIT — the six sections

One column, `max-width: 860px`, centred, with a sticky right gutter at ≥1280px carrying validation
and the AI companion (C.4).

```
 ┌─ 860 ────────────────────────────────────────────────────┐  ┌─ 300 ──────────────┐
 │  Review your agent                          ✎ rename     │  │ READY TO LAUNCH    │
 │  Inbound Lead Qualifier · OpenClaw · Prospector           │  │  ✓ Role            │
 ├──────────────────────────────────────────────────────────┤  │  ✓ Agent           │
 │ ┌ SECTION CARD ─────────────────────────────────────────┐│  │  ⚠ 2 skills need   │
 │ │ ROLES                                    ✎ Change     ││  │    review          │
 │ │ ┌──┐ Prospector                                       ││  │  ✓ Rules           │
 │ │ │P │ Finds and qualifies new business                 ││  │  ⚠ Context empty   │
 │ │ └──┘                                                  ││  │  ✓ Schedules       │
 │ │ Why: your brief is about inbound enquiries and        ││  ├────────────────────┤
 │ │ first-touch replies.                                  ││  │ ◆ Ask about this   │
 │ └───────────────────────────────────────────────────────┘│  │   setup            │
 │ ┌───────────────────────────────────────────────────────┐│  │  ┌──────────────┐  │
 │ │ AGENTS                                   ✎ Edit       ││  │  │ Type here…   │  │
 │ │ Name        [ Inbound Lead Qualifier              ]   ││  │  └──────────────┘  │
 │ │ Harness     [ OpenClaw ▾ ]  Autonomy [ Ask first ▾]   ││  │  · Why this skill? │
 │ │ Tone        [ Professional ▾ ]                        ││  │  · Make it stricter│
 │ │ Instructions                                          ││  │  · Add a schedule  │
 │ │ ┌───────────────────────────────────────────────────┐ ││  └────────────────────┘
 │ │ │ You watch the shared inbox for new enquiries…     │ ││
 │ │ └───────────────────────────────────────────────────┘ ││   sticky, top: 88px
 │ └───────────────────────────────────────────────────────┘│
 │ … SKILLS · RULES · CONTEXT · SCHEDULES (C.3.1 – C.3.4)   │
 ├──────────────────────────────────────────────────────────┤
 │  ┌ sticky bottom bar, c.glass, 1px c.line above ────────┐│
 │  │ 6 sections · 2 need review    [Save as template] [Continue →]│
 │  └──────────────────────────────────────────────────────┘│
 └──────────────────────────────────────────────────────────┘
```

Every section card is the same shell: `bg c.panel`, `1px c.border`, `r.radiusMd`, `padding 22px`,
`gap 16px` — i.e. the existing `SettingCard` (`fleet/[id]/page.tsx:1439-1487`), extended with a
`headerAction` slot and a `state: "ok" | "review" | "empty"` prop that tints the left edge
(`borderLeft: 2px solid` → `c.green` / `c.amber` / `c.border`).

### C.3.1 SKILLS — the section with the most to decide

```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ SKILLS                                              7 selected  │ + Add skill  │
 │ ┌───────────────────────────────────────────────────────────────────────────┐ │
 │ │ ☑  web-research            ● low      ✓ OpenClaw        anthropic/  ⓘ  ✕  │ │  row h 46
 │ │      Searches the web and cites sources                                    │ │  name mono 13 / w.monoStrong / c.text
 │ ├───────────────────────────────────────────────────────────────────────────┤ │  desc font.sans 12 / w.body / c.muted
 │ │ ☑  crm-sync                ● medium   ✓ OpenClaw        @hubspot/  ⓘ  ✕   │ │  risk dot 7px + mono 10 label
 │ │      Reads and writes contacts in your CRM                                 │ │  compat ✓ c.green / ✕ c.red / ⚠ c.muted
 │ ├───────────────────────────────────────────────────────────────────────────┤ │  publisher mono 10.5 / c.faint
 │ │ ☐  browser-drive           ● high     ✓ OpenClaw        @steipete/ ⓘ  ✕   │ │
 │ │      ⚠ Runs an authenticated browser as you. Confirm to enable.            │ │  warning row: c.redWash bg, c.red text
 │ └───────────────────────────────────────────────────────────────────────────┘ │
 │  Suggested by your brief but not added:                                        │
 │   + lead-enrichment   + email-templates                                        │  ghost chips, 1px dashed c.border
 └───────────────────────────────────────────────────────────────────────────────┘
```

- **A `high`-risk skill cannot be added on this screen at all.** `docs/SKILL_REPOSITORY.md` §7.6
  is explicit: the hire path offers `low`/`medium` only, capped at 8 suggestions, and a `high`
  skill requires the drawer's acknowledgement flow (D.4) because that flow is what writes
  `agent_skills.risk_acknowledged` and `acknowledged_by_id`. A `high` row therefore renders here
  **disabled**, with `▲ Needs review after setup — add it from the agent's Skills tab`. The
  wireframe row above showing an unchecked `browser-drive ● high` with an inline confirm was
  wrong; it would have written an attachment with no acknowledger.
- `+ Add skill` opens the Skill Repository drawer (D.4) in "pick" mode, filtered to the chosen
  harness, without leaving the page — still `low`/`medium` only while in the hire flow.
- `ⓘ` opens the skill detail drawer read-only.
- **Compatibility has three states, not two.** `agent_skills.compat_asserted` is never defaulted
  true, so the row renders `✓` (asserted compatible), `✕` (a requirement is provably unmet on this
  harness) or `⚠` (nobody has asserted it — `harnessCompat[e].basis === "unknown"`). `⚠` is not a
  `✕` and must not be drawn as one; it is also not a tick. Rendering `unknown` as either is the
  OWASP AST10 failure mode this product's value proposition sits on (RISKS R4).
- `✕` rows cannot be checked; the row names the missing binary/env/config verbatim from
  `skills.requirements` (OpenClaw's `metadata.openclaw.requires` shape). `⚠` rows can be checked
  but route through D.4 step 4's explicit `assertCompat`.

### C.3.2 RULES & BOUNDARIES

```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ RULES & BOUNDARIES                                    5 rules │ + Add rule    │
 │  ╭ NEVER ╮ Quote a price without my approval                        ⋮⋮  ✎  ✕ │  kind pill: NEVER c.red / MUST c.green
 │  ╭ NEVER ╮ Email a domain on the suppression list                   ⋮⋮  ✎  ✕ │            ESCALATE c.amber
 │  ╭ MUST  ╮ Cite the source for every claim about a company          ⋮⋮  ✎  ✕ │  pill mono 10 / w.monoLabel, 1px wash border
 │  ╭ ESCL. ╮ Anything above $300 → owner                              ⋮⋮  ✎  ✕ │  text font.sans 13.5 / w.body / c.text2
 │  ┌──────────────────────────────────────────────────────────────────────────┐ │  ⋮⋮ = drag handle (keyboard: ↑/↓ with the
 │  │ [ NEVER ▾ ]  Type a rule…                                        [Add]   │ │       row focused, announced via aria-live)
 │  └──────────────────────────────────────────────────────────────────────────┘ │
 └───────────────────────────────────────────────────────────────────────────────┘
```

Rules are stored as a typed array, not a free-text blob. The existing `agents.rules` TEXT column
stays as the flattened form the runtime reads (one rule per line, prefixed `NEVER:` / `MUST:` /
`ESCALATE:` — `docs/BACKEND_INTEGRATION_CONTRACT.md` §2.2 concatenates it after `instructions` to
form the brief); the structured version lives in **`agent_templates.draft.boundaries`** — the draft
key is `boundaries`, not `rules` — and in the agent's settings so the editor can round-trip it.
*Rejected: replacing `agents.rules` with JSONB — it would break the existing prompt builder in
`lib/llm/agent-prompt.ts` for every live agent.*

### C.3.3 CONTEXT — file upload **and** paste-text

```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ CONTEXT                                    3 items · 1.4 MB │ ▤ Add file  ✎ Paste │
 │ ┌───────────────────────────────────────────────────────────────────────────┐ │
 │ │ ▤ ICP definition.md         text          1.2 KB   ✓ indexed        ⓘ  ✕ │ │  row h 44
 │ │ ▤ objection-handling.pdf    file          240 KB   ◐ indexing…      ⓘ  ✕ │ │  state: ✓ c.green / ◐ c.accent / ✕ c.red
 │ │ ▤ acme.com/pricing          url           —        · pending        ⓘ  ✕ │ │
 │ └───────────────────────────────────────────────────────────────────────────┘ │
 │ ┌ DROP ZONE (always visible, becomes the whole card on dragover) ───────────┐ │
 │ │        Drop files here, or click to choose                                │ │  1px dashed c.border-field
 │ │        PDF · DOCX · TXT · MD · CSV · up to 20 MB each                     │  h 92 · radius r.radiusMd
 │ └───────────────────────────────────────────────────────────────────────────┘ │  dragover: bg c.limeWash, border c.accent
 └───────────────────────────────────────────────────────────────────────────────┘
```

**The vocabulary is `agent_context_items`', not this document's.**
`docs/BACKEND_INTEGRATION_CONTRACT.md` §2.6 fixes both enums and an earlier draft of this page
invented replacements for both:

| | values | notes |
|---|---|---|
| `kind` (`context_item_kind`) | `file` · `text` · **`url`** | not `link`. `text` is pasted text in `text_body`; `url` is fetched from `source_url` |
| `state` (`context_item_state`) | `awaiting_upload` → `pending` → `indexing` → `indexed` \| `failed`; `removed` terminal | not `pending/extracting/ready/failed`. The column is **`state`**, not `status` |

`awaiting_upload` is a real UI state — the row exists with `bytes = 0` and no `content_url`, which
is what a template's CONTEXT placeholder materialises as. It renders `· waiting for a file` with an
`[ Upload ]` action, and the runtime skips it silently. A UI with no `awaiting_upload` state shows
a template's required-context placeholders as broken rows.

**Who fetches a `url` context item — and it is not us.** §2.6 is unambiguous: `source_url` is
user-supplied and therefore an SSRF vector against ArkAgent's own network, and it must be fetched
**in the agent's egress sandbox, not from the control plane**. So there is no `✓ fetched` state
this UI can honestly show at add time. The row sits at `· pending` until the runtime reports
`indexing` → `indexed` via `agent.context_state`, and in mock mode it stays `pending` with
`· not fetched — runtime is in simulator mode`.

If a future change does make the control plane fetch, §2.6 lists the non-negotiables and the UI
must surface the refusal (`failed` / `fetch_blocked`) rather than a spinner: https only, no
credentials in the URL, reject loopback / link-local / RFC1918 / IPv6 ULA **after DNS resolution
and on every redirect hop**, and cap the response.

**Upload limits are server-enforced, and the copy must match them.** §2.6: the platform ceiling is
**20 MB per item**; a template may set a tighter `TemplateContextItem.maxBytes` (default 10 MiB,
`docs/AGENT_TEMPLATE_GENERATOR.md` §3.6) enforced at upload. The drop-zone copy therefore names the
*effective* limit for this draft, not a constant. There is no "10 files" rule — the quota is the
one in E.4 (≤ 50 items, ≤ 100 MB per agent), and the drop zone shows remaining quota, not a
per-drop cap. MIME and extension are validated **server-side** against the §6.6 allowlist; the
`accept` attribute is a convenience, never the control.

**Paste-text** (`✎ Paste`) opens an inline editor in the same card — a title input plus a
`min-height: 200px` textarea — because the most common context is a snippet from a doc the user
cannot attach, and forcing them to save a `.txt` first is the thing that makes people abandon.

```
 ┌─ paste editor, replaces the drop zone while open ──────────────────────────────┐
 │ Title  [ Our ICP                                                            ]  │
 │ ┌──────────────────────────────────────────────────────────────────────────┐   │
 │ │ We sell to Series A–C B2B SaaS in APAC, 50–500 seats…                    │   │  font.sans 14 / w.body
 │ └──────────────────────────────────────────────────────────────────────────┘   │  min-h 200, resize vertical
 │                                          2,140 characters   [Cancel] [Save]    │  mono 11 / c.faint
 └────────────────────────────────────────────────────────────────────────────────┘
```

Both paths write one `agent_context_items` row. Uploads go to blob storage with only `name`,
`mime`, `bytes`, `sha256` and `content_url` in Postgres — so the backend agent service can fetch
the artefact and verify the digest, and the browser holds nothing. Progress is a determinate bar
per row during upload; indexing is indeterminate (`◐`) and polled.

**Pasted text is untrusted content.** `text_body` goes into the agent's prompt as data, never as an
instruction (§2.6, §1.2). The editor renders it back as a text node in a `<textarea>`; nothing on
this page interprets it, and the ATG injection scan (§6.4) has already recorded any findings
against it.

### C.3.4 REMINDERS & SCHEDULERS — the schedule editor

The one genuinely new interactive control in v2.

```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ REMINDERS & SCHEDULERS                          2 schedules │ + Add schedule  │
 │ ┌───────────────────────────────────────────────────────────────────────────┐ │
 │ │ ◷  Morning sweep                                            ⏻ on   ✎   ✕ │ │  row h 62
 │ │    Weekdays at 08:30 · Asia/Singapore                                     │ │  human form: font.sans 13 / w.body / c.text2
 │ │    Next: Mon 31 Aug, 08:30  (in 2d 18h)  30 8 * * 1-5                     │ │  next: mono 11 / c.muted · cron: mono 11 / c.faint
 │ ├───────────────────────────────────────────────────────────────────────────┤ │
 │ │ ◷  Inbox poll                                               ⏻ on   ✎   ✕ │ │
 │ │    Every 15 min, 09:00–17:45, Mon–Fri · Asia/Singapore                    │ │
 │ │    Next: Mon 31 Aug 09:00  (in 2d 19h)  */15 9-17 * * 1-5                 │ │
 │ └───────────────────────────────────────────────────────────────────────────┘ │
 └───────────────────────────────────────────────────────────────────────────────┘
```

Editing one expands it in place:

```
 ┌─ schedule editor ─────────────────────────────────────────────────────────────┐
 │ Label        [ Morning sweep                                              ]   │
 │                                                                               │
 │ When         ┌──────────┬──────────┬──────────┬──────────┐                    │  Seg, 4 options
 │              │  Daily   │ Weekdays │  Weekly  │  Custom  │                    │  active: c.lime / c.ink
 │              └──────────┴──────────┴──────────┴──────────┘                    │
 │                                                                               │
 │ Days         [S][M][T][W][T][F][S]        ← existing Chip, reuse verbatim     │  only when Weekly/Custom
 │ Time         [ 08 : 30 ]   Timezone [ Asia/Singapore ▾ ]                      │
 │ Repeat       ☐ every [ 15 ] minutes between [ 09:00 ] and [ 18:00 ]           │
 │                                                                               │
 │ ┌ ADVANCED  ▸ ─────────────────────────────────────────────────────────────┐  │  <details>, collapsed
 │ │ Cron   [ 30 8 * * 1-5                                    ]  ✓ valid      │  │  mono 13 / w.monoLabel
 │ │ 5 fields: minute hour day-of-month month day-of-week                     │  │  live-validated by lib/schedule/parse
 │ └──────────────────────────────────────────────────────────────────────────┘  │
 │                                                                               │
 │ What it does [ Check the shared inbox and draft replies                   ]   │
 │                                                                               │
 │ ┌ PREVIEW ─────────────────────────────────────────────────────────────────┐  │  c.panelDeep
 │ │ Next 5 runs · Asia/Singapore                                             │  │  mono 11 / w.monoStrong / c.muted
 │ │   Mon 31 Aug  08:30      Tue  1 Sep  08:30      Wed  2 Sep  08:30        │  │  mono 12 / c.text2
 │ │   Thu  3 Sep  08:30      Fri  4 Sep  08:30                               │  │
 │ └──────────────────────────────────────────────────────────────────────────┘  │
     (Weekday names in every example on this page are real: "now" is Sat 29 Aug 2026,
      so `30 8 * * 1-5` next fires Mon 31 Aug. A wireframe whose own cron could not
      produce its own dates is the exact bug CronPreview exists to prevent.)
 │                                                       [ Cancel ]  [ Save ]    │
 └───────────────────────────────────────────────────────────────────────────────┘
```

**The Preview block is the whole point.** Cron is unreadable and DST is a trap; showing five
concrete local datetimes, recomputed on every keystroke by `lib/schedule/nextRuns(cron, tz, 5)`,
is what makes a non-technical user trust the control. It is pure client-side maths — no network,
no LLM — so it works in every mode. **`lib/schedule/cron.ts` is the normative implementation**
(`docs/BACKEND_INTEGRATION_CONTRACT.md` §2.7 names it as the definition the runtime may port);
`parse` / `nextRuns` / `describe` / `fromNaturalLanguage` are its surface, and no second parser may
exist in the client.

**The dialect is not the obvious one and the editor must not pretend otherwise.** Per §2.7:
`?` is a synonym for `*` in the two day fields only; `JAN`…`DEC` / `SUN`…`SAT` are accepted; `0`
and `7` both mean Sunday; a seconds field, `@daily` macros and the Quartz `L` / `W` / `#`
extensions are **rejected at parse time** with a named error rather than silently reinterpreted.
When both day-of-month and day-of-week are restricted the match is a **union** — `0 9 13 * FRI`
fires every 13th *and* every Friday. The preview is what makes that visible; the ADVANCED field's
helper line says it in words.

The four `When` presets write cron; `Custom` reveals the day chips; `ADVANCED` reveals the raw
field and is the only place a user can type cron directly. Typing a valid cron back-fills the
presets when it maps to one, and switches `When` to `Custom` when it does not.

**DST is shown, not hidden.** §2.7's three rules are visible in the preview by construction —
a skipped wall clock fires at the instant the clock jumps to, a repeated one fires once for an
hour-restricted expression and twice for an interval-like one. When any of the five previewed runs
crosses a transition in the chosen zone, the row carries `· clocks change` in `c.amber` with the
rule in its `title`. Computing this by adding milliseconds to a UTC instant gives five wrong dates
once a year; walk the zone with `Intl.DateTimeFormat` (RISKS R7).

**Natural language.** The label field accepts `"every weekday at 8:30"` and offers an inline
`↩ use this` when `lib/schedule/fromNaturalLanguage` parses it with confidence — deterministic
regex over a phrase table in all four languages, no LLM. If it does not parse, nothing is offered
and the user uses the presets. Never guess silently.

**Five fields this editor does not expose, and what happens to them.** `agent_schedules` (§2.7) has
columns the UI never sets, so each takes its DDL default and the user cannot see it. Two of those
are user-facing decisions and belong on screen; three are correctly hidden:

| column | disposition |
|---|---|
| `deliver_to` (`chat` \| `email` \| `channel` \| `none`) | **Must be exposed.** "Where does the result go" is the second question every user asks after "when". A `SelectField` under *What it does*, defaulting to `chat`. |
| `max_runs_per_day` (1..288) | **Must be exposed**, as a read-only line in ADVANCED showing the effective ceiling and what happens at it (*"skips with `max_runs_per_day`"*). ATG-L007 already refuses to generate a cron that exceeds it; a user typing `*/1 * * * *` into ADVANCED must see why it will be throttled. |
| `overlap_policy`, `catch_up`, `jitter_seconds` | Hidden, defaults (`skip`, `false`, `0`). Correct: they are fleet-operations knobs, not scheduling intent. |
| `kind` (`cron` \| `interval` \| `once`) | This editor only writes `kind = 'cron'`. The *Repeat every N minutes* control encodes as a `*/N` cron, not as `kind = 'interval'`, so the `CHECK` constraint is satisfied by `cron_expr`. `once` schedules can be created by ATG but only **edited or deleted** here, never created — the editor shows a `once` row read-only with its `run_at`. |

Column names, for the DTO mapping in E.6: the label column is **`name`**, the instruction column is
**`prompt`**, the expression column is **`cron_expr`**. `label` / `action` / `cron` are this
document's display names, not columns.

## C.4 The persistent "AI help" affordance

A user who does not know what to build needs help on **every** screen, not only C.1. So this is one
component, docked, present on `/hire`, `/dashboard/templates`, `/dashboard/skills` and the agent
configuration page.

```
  COLLAPSED (default)                    EXPANDED
  ┌────┐                                 ┌─ 320 ──────────────────────────────┐
  │ ◆  │  56×56, fixed                   │ ◆ Ask about this setup        [—]  │  header 44
  │    │  bottom 24 right 24             ├────────────────────────────────────┤
  └────┘  c.lime fill, c.ink glyph       │ You: which skills does this need?  │  user msg: c.limeWash, right
          shadow 0 8px 24px c.shadow     │                                    │
          badge dot c.amber when it has  │ ◆ For inbound qualification you    │  agent msg: c.panelDeep, left
          an unread suggestion           │   usually want web-research and…   │  font.sans 13.5 / w.body / c.text2
                                         │                                    │
                                         │   [ Add web-research ]  ← ACTION   │  inline action chips apply the
                                         ├────────────────────────────────────┤  change to the form behind it
                                         │ · Why this skill?                  │  suggested prompts, context-aware
                                         │ · Make the rules stricter          │  mono 12 / w.monoLabel / c.accent
                                         │ · Add a daily schedule             │
                                         ├────────────────────────────────────┤
                                         │ [ Ask anything…            ]  [→]  │
                                         └────────────────────────────────────┘
                                          width 320 · height min(560px, 70vh)
                                          at >=1280px it docks into the C.3 gutter instead of floating
```

**What makes it useful rather than decorative:** its replies can carry **action chips** that mutate
the form the user is looking at — `[ Add web-research ]`, `[ Set autonomy to Ask first ]`,
`[ Add a 08:30 weekday schedule ]`. Each chip is a typed patch against the draft, applied
optimistically and undoable from the same message. Text-only advice would just be a chatbot.

**Suggested prompts are per-screen and per-state**, drawn from a static table in
`lib/i18n/atg.ts` keyed by `(screen, sectionWithProblem)`. On the Templates page with no filters
they are *"What can an agent actually do?"*, *"Which template suits a 5-person team?"*. On C.3 with
an empty CONTEXT section the first one is *"What context should I give it?"*.

**With no LLM key** the panel does not disappear — it becomes a **guide**: the suggested-prompt
list stays, and each prompt maps to a canned, written answer plus the same action chips. The
composer input is disabled with the placeholder *"Free-form questions need an AI provider."* This
keeps the affordance in the same place in every deployment so the UI does not shift shape.

**The `context` prop is untrusted data and must be fenced as such.** It serialises whatever the
user is looking at — which on `/dashboard/templates` and `/dashboard/skills` includes another
tenant's template text and third-party skill descriptions and `SKILL.md` bodies. That payload goes
into a prompt. It is fenced exactly as `docs/AGENT_TEMPLATE_GENERATOR.md` §4.1 fences the user's
brief: wrapped in `<screen_context>` with `DATA_NOT_INSTRUCTIONS`, with the fence token stripped
from the content so it cannot close its own fence. **Do not ask a model whether the context
contains an injection** — §6.4: that is a model call whose input is the attack, and it fails open.

**Action chips are typed patches, validated server-side.** A chip's payload is parsed with the same
Zod schema the form's own submit uses before it is applied; a chip is never a free-form mutation
and never widens a permission. Specifically: **no chip may enable a `high`-risk skill, raise an
autonomy level, raise a spend limit, or turn on a tool** — the same restrictive-only rule §6.3
applies to lint remediations. A chip that could grant capability is a prompt-injection privilege
escalation with a nice button on it.

**Rate limiting.** The composer shares the workspace's generation budget (§9.5). A `429` renders in
the panel as a counted-down retry line, never as a silent no-op — the panel is the one place in the
product where a dead send button looks like a bug rather than a limit.

---

# D. SKILL REPOSITORY — `/dashboard/skills`

Backed by `skills` + `skill_sources`, seeded from the 100 verified entries in
`docs/research/SKILL_ECOSYSTEM.md` §A. The research's headline finding shapes this page: **all four
harnesses read the same `SKILL.md` format from `.agents/skills/`**, so harness is a *runtime
dependency* facet, not a format facet, and the page must never present it as "which version of
this skill do I need".

> **This section is subordinate to `docs/SKILL_REPOSITORY.md` §7, which is the UI contract of
> record for this page.** Where the two disagree, §7 wins and this document is the one to edit.
> The reconciliations below were merged in after an earlier draft of this section diverged on six
> concrete points: the `localStorage` key (**`ark-skills-view`**, not `ark-view:skills`), the
> drawer width (**~560px**, not 640), the card grid minimum (**280px**, not 320), the sort keys,
> the `?skill=<publicId>` URL state, and the ban on `c.faint` anywhere on this page.

**Two things this page must do that no other page does.** §7.4 item 1: when
`skills.publisher_verified` is `false`, the owner handle renders **at full contrast directly under
the name** — this is the `mukul975` / `Anthropic-Cybersecurity-Skills` name-vs-authority case and
it must be impossible to miss. §7.1: **`c.faint` is not used on this page at all**, and card
summaries are `c.text2`, never `c.muted`. The wireframes below have been corrected accordingly;
any `c.faint` that creeps back into a skill card is a review failure, not a taste question.

## D.0 The three facets, and why all three are top-level

Per §B of the research: category alone cannot answer *"can my Codex agent run this, and should
it?"* So the control bar carries **category**, **harness** and **risk** at equal weight, plus
search and source.

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │  Skills                                                                              │  font.space 30 / w.display
 │  1,284 skills from ClawHub, the MCP registry and GitHub. Verified daily.             │  font.sans 14 / w.body / c.text2
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │ ┌─ 320 ────────────────────┐ ┌ 160 ──┐┌ 150 ──┐┌ 130 ──┐┌ 140 ──┐ ┌ 160 ┐┌ 76 ────┐  │
 │ │ ⌕  Search skills…        │ │Category▾││Harness▾││ Risk ▾ ││Source ▾│ │Sort ▾ ││ ▦  ☰  │  │
 │ └──────────────────────────┘ └───────┘└───────┘└───────┘└───────┘ └─────┘└────────┘  │
 │   Risk renders as three chips (LOW · MED · HIGH), not a dropdown — §7.2 item 4        │
 │ ┌──────────────────────────────────────────────────────────────────────────────────┐ │
 │ │ HIGH chip off by default · "3 higher-risk skills hidden — show"                  │ │  mono 11.5 / w.monoLabel / c.muted
 │ └──────────────────────────────────────────────────────────────────────────────────┘ │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

| facet | values | default |
|---|---|---|
| Category | the 16 taxonomy slugs. `agent-meta` and `security-secrets` are pinned to the top of the list, not alphabetised — §B says users are visibly shopping for them | all |
| Harness | OpenClaw · Hermes · Codex Harness · DeepSeek Harness · **Runs anywhere** | the current agent's harness when opened in "pick" mode, else all |
| Risk | Low · Medium · High | `{low, medium}` |
| Source | rows of `skill_sources`, labelled with `skill_sources.name` and counted from `facets.source` | all |
| Sort | `popularity` (default) · `downloads` · `stars` · `updated` · `name` | `popularity` |

**The sort keys are the API's, not prose.** `docs/SKILL_REPOSITORY.md` §7.2 fixes them and
`GET /api/skills` accepts them from a fixed allowlist. "Highest trust" is not one of them and there
is no trust score to sort on; `popularity` is the 0–100 editorial rank set by the seed and by
admins, which is what "recommended" actually means here.

The default filter (`risk ∈ {low, medium}`, `nonSuspiciousOnly = true`) is exactly the product
surface `docs/research/SKILL_ECOSYSTEM.md` **§D4 "Product surface"** prescribes. (Every "§D5" in an
earlier draft of this section was a citation error: that research doc has D1–D4, then E and F. The
floor rule is **§D4 step 5**; the default filter, the high-risk confirmation and the version pin
are all **§D4 "Product surface"**; "explain *why* something is high rather than colouring it red"
is **§D4 "Storage"**.) It is a **filter with a visible count**, not a hidden policy: when the
`HIGH` chip is off and the count is non-zero the bar shows `hiddenByRisk` as
*"3 higher-risk skills hidden — show"*, per §7.2 item 4. Never auto-toggle it.

## D.1 Card view

`--r-gallery` again, but at this page's own minimum: `repeat(auto-fill, minmax(280px, 1fr))`
per `docs/SKILL_REPOSITORY.md` §7.3, which gives **3 × 361px at 1124px** and 4-up on a wide
monitor. The card below is drawn at 361px.

```
 ┌ 361 ─────────────────────────────────────────────────────┐
 │ 18px                                                     │
 │  web-research                              ╭ ● LOW ╮      │  name mono 15 / w.monoStrong / c.text
 │  anthropic ✓ Anthropic                     ╰───────╯      │  handle mono 11 / w.monoLabel / c.muted
 │                                     risk pill: c.greenWash│  ✓ ONLY when publisher_verified
 │ 12px                                bg + c.green text     │  risk pill mono 10 / w.monoLabel
 │  Searches the web, reads pages and cites every source     │  font.sans 13.5 / w.body / c.text2
 │  it used. Read-only; no credentials.                      │  2 lines, clamped
 │ 14px                                                      │
 │  ┌ RUNS ON ──────────────────────────────────────────┐    │
 │  │ ⬢ OpenClaw  ⬢ Hermes  ⬡ Codex  ⬔ DeepSeek         │    │  mono 11 / w.monoLabel
 │  └───────────────────────────────────────────────────┘    │  ⬢ filled = supported · ⬡ hollow = not supported
 │ 12px                                                      │  ⬔ dashed  = basis "unknown" — NOT a tick, NOT a cross
 │  ┌────────────┬────────────┬────────────┐                 │
 │  │ INSTALLS   │ UPDATED    │ LICENCE    │                 │  label mono 10 / c.muted
 │  │ 476,682    │ 6d ago     │ MIT        │                 │  value font.space 13 / w.strong / c.text
 │  └────────────┴────────────┴────────────┘                 │  LICENCE renders the string + "unconfirmed" (D.5)
 │ 12px                                                      │
 │  Search & Research                                        │  category, mono 11 / c.muted
 │ 14px                                                      │
 │  ┌───────────────────────────┐ ┌──────────────────────┐   │
 │  │  Add to agent          ▾  │ │       Details        │   │  primary c.lime; ▾ opens the agent picker
 │  └───────────────────────────┘ └──────────────────────┘   │
 │ 18px                                                      │
 └───────────────────────────────────────────────────────────┘
   height 306px
```

**Three harness states, always four slots.** `docs/SKILL_REPOSITORY.md` §7.3: filled for
supported, hollow for unsupported, **outlined-dashed for `basis: "unknown"`**. The dashed pip is
the visual form of "we have not asserted this" and it is the whole OWASP AST10 story in one glyph.
An earlier draft of this card drew two states (`✓` / `✕`), which forces `unknown` into one of them
— exactly the failure RISKS R4 names. Hover gives `harnessCompat[e].note`.

**Risk pill colours** map straight onto tokens that now pass AA in all six palettes (A.3.7):

| level | bg | text | glyph |
|---|---|---|---|
| low | `c.greenWash` | `c.green` | `●` |
| medium | `c.limeWash` when the accent is warm, else a neutral `c.panelDeep` | `c.amber` | `◐` |
| high | `c.redWash` | `c.red` | `▲` |

The glyph carries the meaning as well as the colour, so the three levels are distinguishable
without hue (I.5).

## D.2 List view

```
 ┌───────────────────────────────────────────────────────────────────────────────────────────────┐
 │ SKILL                        PUBLISHER      CATEGORY        RISK   RUNS ON        INSTALLS  ⋯ │
 ├───────────────────────────────────────────────────────────────────────────────────────────────┤
 │ web-research                 anthropic ✓    Search & Res.   ● LOW  ⬢⬢⬢⬢            476,682  ⋯ │
 │   Searches the web and cites every source                                                     │
 ├───────────────────────────────────────────────────────────────────────────────────────────────┤
 │ github                       @steipete      Git & VC        ▲ HIGH ⬢⬢⬔⬔            196,851  ⋯ │
 │   ⚠ Inherits your full gh auth scope                                                          │  warning line c.red
 └───────────────────────────────────────────────────────────────────────────────────────────────┘
   7 tracks, column-gap 12px (6 gaps = 72px). Fixed tracks sum to 610px, so at 1124px usable
   SKILL resolves to 1124 − 610 − 72 = 442px:
       minmax(0,1fr)→442 · 130 · 150 · 84 · 110 · 96 · 40      row h 56
```

`RUNS ON` renders four fixed glyph slots in harness order (OpenClaw, Hermes, Codex, DeepSeek) so
the column is scannable as a bit pattern — and the pattern needs the three-state alphabet from D.1,
not a tick/cross, or the column reads "supported everywhere" for a skill nobody has tested. Slot
title attributes give the full name; the accessible name is a `<span class="sr-only">` sentence
that says *which* harnesses are supported and *which are unverified*, in words. §7.3 also requires
this view to show `licenseVerified` as an explicit "unconfirmed" marker rather than an empty cell —
this is the fleet-audit view, and a blank is indistinguishable from "fine".

## D.3 Detail drawer

`width: min(560px, 100vw)` per `docs/SKILL_REPOSITORY.md` §7.4, and **the drawer owns a URL
param**: opening it pushes `?skill=<publicId>`, so the view is linkable and survives a refresh, and
closing pops it. This is where the safety story is told, because
`docs/research/SKILL_ECOSYSTEM.md` §D4 ("Storage") requires the UI to *explain why something is
high-risk rather than just colouring it red*.

```
 ┌ min(640, 100vw) ────────────────────────────────────────────────┐
 │  github                                          ╭ ▲ HIGH ╮ [✕] │  mono 20 / w.monoStrong / c.text
 │  @steipete · v2.4.1 · MIT · 196,851 installs                    │  mono 11.5 / w.monoLabel / c.muted
 ├─────────────────────────────────────────────────────────────────┤
 │  Reads and writes GitHub issues, PRs, releases and CI runs.      │  font.sans 14 / w.body / c.text2
 ├─────────────────────────────────────────────────────────────────┤
 │  WHY THIS IS HIGH RISK                                           │  mono 11 / w.monoStrong / c.muted
 │  ┌───────────────────────────────────────────────────────────┐   │  c.redWash bg · 1px c.redBorder
 │  │ ▲ Inherits your entire `gh` authentication scope.          │   │  font.sans 13.5 / w.body / c.text2
 │  │   Broad credential  ·  capability score 8                  │   │  mono 11 / c.red
 │  │ Modifiers applied:                                         │   │
 │  │   −2  ClawScan verdict "pass", security "clean"            │   │  mono 11.5 / c.muted · one line per signal
 │  │   −1  provenance server-resolved-github-import             │   │  from skills.risk_signals JSONB, rendered
 │  │   −1  OSI licence (MIT)                                    │   │  through lib/i18n/skills.ts keyed on
 │  │   −1  downloads >= 100,000                                 │   │  signal.code — never raw English
 │  │   ─────────────────────────────────────────                │   │
 │  │   Score 3 → banded HIGH by the floor rule: a skill that     │   │
 │  │   brokers credentials is never below high.                 │   │
 │  └───────────────────────────────────────────────────────────┘   │
 ├─────────────────────────────────────────────────────────────────┤
 │  REQUIREMENTS                                                    │
 │   bins    gh >= 2.40                        ✓ present on OpenClaw│  mono 12 / w.monoLabel / c.text2
 │   env     GH_TOKEN                          ⚠ you must provide   │  status ✓ c.green / ⚠ c.amber / ✕ c.red
 │   config  —                                                      │
 │   os      linux, darwin                                          │
 ├─────────────────────────────────────────────────────────────────┤
 │  RUNS ON                                                         │
 │   ✓ OpenClaw   ✓ Hermes   ✓ Codex Harness   ✓ DeepSeek Harness   │
 │   Compatibility is asserted per runtime dependency, not assumed. │  font.sans 12 / w.body / c.muted
 ├─────────────────────────────────────────────────────────────────┤
 │  SCAN                                                            │
 │   ClawScan     pass · clean          2026-08-29 04:12 UTC        │  mono 12 / c.text2 · from scanner_verdict
 │   VirusTotal   0 / 68 vendors                                    │  omitted entirely when absent — never "0/0"
 │   Artifact     sha256 9f2a…c41d                                  │  mono 11 / c.muted, selectable + CopyButton
 │   Provenance   server-resolved-github-import                     │
 ├─────────────────────────────────────────────────────────────────┤
 │  SOURCE & LICENCE                                                │
 │   Source       github.com/steipete/agent-skills ↗                │  skills.source_url
 │   Attribution  ClawHub · @steipete ↗                             │  skills.attribution_url — MANDATORY, see below
 │   Licence      MIT · unconfirmed                                 │  license + license_verified
 │   Versions     v2.4.1 (pinned) · v2.4.0 · v2.3.2 …               │  skills.known_versions, ≤20, newest first
 ├─────────────────────────────────────────────────────────────────┤
 │  ▸ SKILL.md                                          view source │  <details>, lazy-loaded, <pre> TEXT ONLY
 ├─────────────────────────────────────────────────────────────────┤
 │  ┌──────────────────────────────────────┐ ┌───────────────────┐  │  sticky footer
 │  │  Add to agent                     ▾  │ │  Open on ClawHub ↗│  │
 │  └──────────────────────────────────────┘ └───────────────────┘  │
 └─────────────────────────────────────────────────────────────────┘
```

The "Modifiers applied" list is rendered directly from `skills.risk_signals`, one line per
`{ code, delta, detail }`, each translated via `lib/i18n/skills.ts` keyed on `signal.code`. No prose
is generated, so it works with no LLM key — the whole rubric is deterministic
(`docs/research/SKILL_ECOSYSTEM.md` §D4). Show `risk_score` as the total; do not recompute the
arithmetic in the client, because a client that disagrees with `risk_level` is worse than no
explanation.

**Three non-negotiables in this drawer.**

1. **`attribution_url` is a mandatory link-back**, not an optional nicety — it is a ClawHub reuse
   condition (`docs/SKILL_REPOSITORY.md` §7.4 item 7), so the SOURCE & LICENCE block is not
   collapsible and the link is visible, not a tooltip.
2. **Everything upstream is rendered as a text node.** `name`, `summary`, `description`,
   `publisher_name`, `deprecation_note`, `block_reason` and the `SKILL.md` body are third-party
   strings from an allowlisted host — §5.5 classifies them as UNTRUSTED DATA. §7.4 item 2 is
   explicit: **no markdown rendering.** `SKILL.md` goes in a `<pre>` inside `.ark-scroll`; every
   outbound link is built only from `source_url` / `attribution_url` / `homepage_url` (validated
   `https:` at ingest) and carries `rel="noopener noreferrer"`. Never build an `href` from a
   description.
3. **Skill text is not translated.** §7.7: `name`, `summary` and `description` stay in the
   publisher's language and the drawer says so once, rather than pretending otherwise.

## D.4 Add-to-agent

`Add to agent ▾` opens a `MenuPopover` listing the workspace's agents, each row showing name,
harness and whether the skill is already attached.

```
 ┌ 300 ────────────────────────────────┐
 │  ADD TO                             │  mono 11 / w.monoStrong / c.muted
 │  ┌────────────────────────────────┐ │
 │  │ ◉ Ada · OpenClaw               │ │  compatible + not attached → selectable
 │  │ ◉ Rex · Hermes        attached │ │  attached → disabled, mono 11 c.faint
 │  │ ◌ Kip · Codex   needs `gh` bin │ │  incompatible → disabled + reason
 │  └────────────────────────────────┘ │
 │  ─────────────────────────────────  │
 │  + Add to a new agent               │  → /hire?skill=<slug>
 └─────────────────────────────────────┘
```

**The gating is server-driven, and the client must not decide a step can be skipped.**
`docs/SKILL_REPOSITORY.md` §7.5 fixes a four-step flow in which steps 2–4 appear **only when the
server says they must** — `POST /api/agents/{id}/skills` answers `201`, or a `409` whose body names
the precondition. The menu above may disable a row it *believes* is incompatible as a hint, but the
attach still round-trips; a purely client-side gate is a control that any request can walk past.

| step | trigger | screen |
|---|---|---|
| 1 · pick the agent | always (skipped when entered from `/dashboard/fleet/[id]`) | the popover above |
| 2 · tool reconciliation | `409 tools_required` | *"`browser-drive` needs the **Browser** tool. Adding it turns Browser on for **Ada**."* + a checkbox mapping to `enableTools: true`. **Declining cancels the attach** — it never attaches a crippled skill. This step has no UI anywhere else in v2 and it changes the agent's authority, so it cannot be omitted. |
| 3 · risk acknowledgement | `409 risk_acknowledgement_required` | the dialog below, built from the `riskSignals` in the **response**, not from a generic warning |
| 4 · compatibility assertion | `409 harness_incompatible` | *"We have not verified this skill on Codex Harness. Add anyway?"* → `assertCompat: true`. The one place the product makes the user say the words, because AST10 is our value proposition and our risk in one sentence. |

Step 3's dialog **quotes the specific capability** and requires a deliberate press. Per §7.5 the
confirm is a checkbox **plus** a button, never a single click:

```
 ┌─ 480 ──────────────────────────────────────────────────────┐
 │  Give Ada full GitHub access?                              │  font.space 18 / w.display / c.text
 │                                                            │
 │  `github` inherits your entire `gh` authentication scope.   │  font.sans 14 / w.body / c.text2
 │  Ada will be able to read and write any repository, issue   │
 │  or release your token can reach — without asking again.    │
 │                                                            │
 │  Version pinned: v2.4.1                                    │  mono 11.5 / w.monoLabel / c.muted
 │  ☐ I understand what this gives Ada                        │  required — the button stays disabled
 │                       [ Cancel ]  [ Yes, add it ]          │  confirm = c.red fill, c.ink text
 └────────────────────────────────────────────────────────────┘
```

**On confirm the server writes `agent_skills`** with the resolved `version` pinned — never
`latest`, per `docs/research/SKILL_ECOSYSTEM.md` §D4 "Product surface". The columns it sets, with
their real names (`docs/SKILL_REPOSITORY.md` §1.4): `version`, `harness` (a snapshot of
`agents.engine`), `compat_asserted`, `risk_level_at_attach`, **`risk_acknowledged`** and
**`acknowledged_by_id`** for step 3, **`added_by_id`** and `created_at` for provenance, and
`origin` / `origin_ref`. There is no `attached_by` and no `attached_at`; an earlier draft of this
document named both and neither exists.

Because `risk_level_at_attach` is a snapshot, a later re-score that raises a skill's risk surfaces
as *"2 attached skills changed risk"* on the agent's configuration page rather than silently
mutating the agent's blast radius. The same holds for `harness`: when it differs from
`agents.engine` the row is flagged **`needs_recheck`**, never assumed portable.

Then `201`, an optimistic row in the agent's SKILLS section at `status: "pending"`, and the
response's `runtime` field decides the line under it — *"installing"*, *"saved (simulated
runtime)"*, or *"saved — this runtime cannot install skills yet"*. There is no toast (G.4); the row
itself is the receipt.

## D.5 Honest gaps the UI must show, not hide

`docs/research/SKILL_ECOSYSTEM.md` §F: **licences for all 31 ClawHub rows are UNKNOWN** until a
per-skill `/file` fetch resolves them, and `/api/v1/skills/export` returns 401.

- **`license` is never null** — the column is `varchar(60) NOT NULL DEFAULT 'UNKNOWN'`
  (`docs/SKILL_REPOSITORY.md` §1.3), so a null-check would never fire and the card would print the
  word `UNKNOWN`. The rule is: when `license = 'UNKNOWN'` render `—` with a `title` of *"Not
  resolved yet"*; when `license_verified = false` render the string followed by `· unconfirmed` in
  `c.muted`. Never a guessed value, and an unresolved licence is one of the `+1` modifiers already
  shown in the risk panel.
- **Staleness reads `upstream_fetched_at`**, not `verified_at` — there is no such column. (The
  neighbouring columns are `reviewed_at`, a human review, and `risk_scored_at`, the last rescore;
  neither answers "is this listing current".) Older than the §C5 sync cadence ⇒ `⧗ stale` beside
  the publisher handle.
- The four curated-list entries with understated star counts come from a `skill_sources` row whose
  **`kind = 'curated_list'`** (there is no `skills.source = "curated"`; `source_id` is an FK to the
  allowlist). They are **excluded from the `downloads` and `stars` sorts**, because those numbers
  are not comparable — they remain sortable by `popularity`, which is editorial.

## D.6 Empty states

- **Loading:** skeleton cards at the current `perPage`, never a spinner over a grid
  (`docs/SKILL_REPOSITORY.md` §7.3).
- **No results:** *"No skills match these filters."* + `Clear filters`. When the `HIGH` chip is off
  and `hiddenByRisk > 0`, add a second line: *"3 more match if you include high-risk skills."* with
  a link that turns the chip on. Never auto-toggle it.
- **Nothing published yet:** distinct from "no results". *"The skill catalogue hasn't been synced
  yet."* with the last attempt time. The `Sync now` button appears **only for platform staff** —
  `POST /api/skills/sync` is guarded by `requirePlatformRole("admin")` (`lib/api.ts:61`), not by
  workspace membership, because a sync is a platform-wide catalogue write. An earlier draft said
  "workspace admins", which is the wrong subject entirely: `memberRoleEnum` governs a workspace,
  `platformRoleEnum` governs the platform. Hiding the button is cosmetic; the route is the control.
- **Request failed:** `⚠` + the message + `[ Try again ]`, with the filter bar still populated.

---

# E. AGENT MANAGEMENT — `/dashboard/fleet/[id]?tab=config`

## E.0 What is wrong with today's Settings tab

`SettingsTab` (`app/dashboard/fleet/[id]/page.tsx:1641-2619`, ~980 lines) is a single scrolling
column of eleven `SettingCard`s plus a right rail. It works, and its *primitives* are good — keep
`SettingCard`, `Field`, `Toggle`, `Seg`, `SelectField`, `Chip` verbatim. Four things are wrong:

1. **No dirty state.** `save()` (`:1904-1926`) posts everything unconditionally. There is no
   discard, no unsaved-changes guard on navigation, and no per-field indication of what changed.
   A user who edits three fields and navigates away loses all three silently.
2. **Everything is one flat list.** Eleven cards, ~40 fields, no navigation. Finding "heartbeat"
   means scrolling past the model temperature slider.
3. **It does not cover v2's surface.** No skills picker beyond a chip list of a hardcoded 14-item
   array (`lib/agent-settings.ts:183-198`), no context items, no schedules, no rules editor,
   harness restricted to `openclaw | hermes` (`:1646-1647`, `:1977-1981`).
4. **Saving does not reach the runtime.** `PATCH /api/agents/{id}` pushes to a Manager endpoint
   that 404s inside an empty catch (`docs/research/RUNTIME_INTEGRATION.md` §0) — so the user sees
   "Saved" while the agent keeps its old config. This is the most damaging of the four.

## E.1 New shape — a two-pane editor with a section rail

```
 ┌ 1124 usable ────────────────────────────────────────────────────────────────────────────┐
 │  ◉  Ada                                    ● running     [ Pause ]  [ ⋯ ]                │  page header, unchanged
 │  Prospector · OpenClaw · sgp-1 · up 3d 4h                                                │
 │ ┌ tabs ─────────────────────────────────────────────────────────────────────────────────┐│
 │ │ ACTIVITY   TASKS   CHAT   PERFORMANCE   USAGE   ▸CONFIG◂                              ││  mono 12, active w.monoStrong
 │ └───────────────────────────────────────────────────────────────────────────────────────┘│
 │ ┌ 200 ───────────┐ ┌ 904 ────────────────────────────────────────────────────────────────┐
 │ │ IDENTITY     ✓ │ │  ┌ SectionCard ────────────────────────────────────────────────┐   │
 │ │ BRIEF        ● │ │  │ BRIEF                                             ● edited  │   │  dirty dot c.amber
 │ │ RULES        ✓ │ │  │ ...                                                          │   │
 │ │ SKILLS     ●2  │ │  └──────────────────────────────────────────────────────────────┘   │
 │ │ CONTEXT      ✓ │ │  ┌──────────────────────────────────────────────────────────────┐   │
 │ │ SCHEDULES    ✓ │ │  │ RULES & BOUNDARIES                                           │   │
 │ │ HARNESS      ✓ │ │  └──────────────────────────────────────────────────────────────┘   │
 │ │ CHANNELS   ⚠1  │ │  …                                                                  │
 │ │ LIMITS       ✓ │ │                                                                     │
 │ │ ───────────    │ │                                                                     │
 │ │ RUNTIME        │ │                                                                     │
 │ │ DANGER ZONE    │ │                                                                     │
 │ └────────────────┘ └─────────────────────────────────────────────────────────────────────┘
 │ ┌ STICKY SAVE BAR — appears only when dirty ───────────────────────────────────────────┐ │
 │ │  ● 3 unsaved changes in Brief, Skills, Channels     [ Discard ]  [ Save & re-sync ]  │ │  h 60, c.glass, 1px c.line
 │ └──────────────────────────────────────────────────────────────────────────────────────┘ │  bottom 0, backdrop-filter blur(8px)
 └─────────────────────────────────────────────────────────────────────────────────────────┘
```

New responsive token: `--r-config: 200px 1fr` → `1fr` below 1024px, where the rail becomes a
horizontal scrolling chip row pinned under the tabs.

**The rail** is `<nav aria-label="Configuration sections">` with in-page anchors, an
`IntersectionObserver` marking the current section, and per-section status glyphs:
`✓` clean · `●` dirty (with a count) · `⚠` invalid (with a count). Clicking scrolls with
`behavior: "smooth"` unless `prefers-reduced-motion` (I.6).

## E.2 The nine sections and every field

| section | fields | writes to |
|---|---|---|
| **IDENTITY** | name, role *(read-only, with "Change role" → warning modal)*, plan tier, avatar hue | `agents.name`, `.plan_tier`, `.hue` |
| **BRIEF** | instructions (textarea, 100px min), tone, reply language, timezone | `agents.instructions`, `settings.tone/.responseLanguage/.timezone` |
| **RULES & BOUNDARIES** | the typed rule list from C.3.2, autonomy `Seg`, approval amount, daily action limit, approve-external toggle | `agents.rules` (flattened) + `settings.autonomy/.approvalAmount/.dailyActionLimit/.approveExternalSends` |
| **SKILLS** | the attached-skill table from C.3.1, `+ Add skill` → D.4 drawer, per-skill version pin and "update available" | `agent_skills` |
| **CONTEXT** | the item list + drop zone + paste editor from C.3.3 | `agent_context_items` |
| **SCHEDULES** | the schedule list + editor from C.3.4, plus a `⏻` per row (`enabled`) and a "pause all" action. There is no `schedules_paused` column and none is needed: "pause all" is one `UPDATE agent_schedules SET enabled = false WHERE agent_id = $1` inside the same transaction that bumps `config_revision`, and it is a **button with a confirm**, not a toggle — because un-pausing cannot know which rows were already off | `agent_schedules` |
| **HARNESS** | harness `Seg` (4 options), model, temperature, max tokens, reasoning effort, local-execution tool toggles, memory + retention, self-improve toggles | `agents.engine`, `settings.*` |
| **CHANNELS** | the existing channel cards (feishu / dingtalk / wechat / wecom) — **unchanged**, they already work | `channels` |
| **LIMITS** | monthly credit cap, escalate-to email, notification toggles, digest time | `settings.*` |
| **RUNTIME** *(read-only)* | engine, machine + region, status (the nine-value `agent_status`), `deployment_status` verbatim, uptime, last heartbeat, instance uuid, `last_error`, and the **Config in sync** row from E.5 (`config_revision` vs `config_applied_revision`) | `agents.*` |
| **DANGER ZONE** | pause/resume, terminate, delete | lifecycle API |

**Harness change is destructive and must say so.** Switching `engine` on a provisioned agent means
a new container. The `Seg` shows the current value; changing it reveals an inline warning card
before the save bar will accept it:

```
 ┌──────────────────────────────────────────────────────────────────────────┐
 │ ▲ Changing the harness rebuilds the machine.                             │  c.redWash · 1px c.redBorder
 │   Ada will stop, a new Codex Harness container is provisioned, and        │  font.sans 13.5 / w.body / c.text2
 │   skills are re-installed. Chat history and context items are kept.       │
 │   2 of 7 skills were asserted against OpenClaw, not Codex Harness, and    │
 │   will be flagged NEEDS RECHECK:  crm-sync, browser-drive                 │  mono 12 / c.amber
 │   They stay attached and disabled until you re-assert or remove them.     │
 │   ☐ I understand                                                          │  must be checked to enable Save
 └──────────────────────────────────────────────────────────────────────────┘
```

**A harness change must not silently delete skills.** `docs/SKILL_REPOSITORY.md` §1.4 is explicit:
`agent_skills.harness` is a snapshot of `agents.engine` at attach, and *"when an agent switches
engine, every row where this differs is flagged `needs_recheck` in the UI instead of being assumed
portable (OWASP AST10)"*. An earlier draft of this card said the rows "will be removed" — that
destroys `risk_acknowledged`, `acknowledged_by_id` and `config`, so re-attaching later silently
re-asks nothing. Flag, disable, keep the row.

## E.3 Dirty-state handling — the contract

State model:

```ts
interface ConfigDraft {
  /** Server truth, refetched after every successful save. */
  base: AgentConfigDTO;
  /** Only the keys the user actually touched. Never a full copy of `base`. */
  patch: Partial<AgentConfigDTO>;
  /** Per-field validation, keyed by the same dotted paths as `patch`. */
  errors: Record<string, string>;
}
```

Rules:

0. **Authorization, before any of this.** Every route under `/api/agents/[id]/**` — config,
   schedules, context, skills, activity — resolves the agent through
   `getAgentRow(id, auth.ctx.workspace.id)` and returns **404** (never 403) when the row is not in
   the caller's workspace, matching `app/api/agents/[id]/route.ts` and `messages/route.ts` today.
   There is no middleware: `requireAuth()` in the handler is the whole boundary, so a route that
   forgets it is world-readable. The same rule covers the SSE endpoints — an event stream is a read
   — and the blob endpoints: a context item's `content_url` must be signed per-agent and served
   `Cache-Control: no-store`, never a guessable path.

1. **A field is dirty when its value differs from `base` by deep-equality**, not when it is
   touched. Typing a character and deleting it clears the dot. `patch` keys whose value re-equals
   `base` are removed on change.
2. **Per-field affordance:** a dirty field gets `borderLeft: 2px solid c.amber` on its `Field`
   wrapper and a `↺` revert button in the label row that restores that one field.
3. **Per-section affordance:** the rail glyph and a `● edited` pill in the card header.
4. **Global affordance:** the sticky save bar, which is the only place `Save` and `Discard` exist.
   It slides up (`transform: translateY(100%)` → `none`, 180ms) on first dirty and is removed
   from the tab order when hidden.
5. **Navigation guard.** `beforeunload` for a hard leave; for an in-app route change, an
   `<AlertDialog>` — *"You have 3 unsaved changes. Discard them?"* / `[ Keep editing ]`
   `[ Discard and leave ]`. The wizard's existing router pushes must be wrapped.
6. **Optimistic concurrency, keyed on `config_revision` — not `updated_at`.**
   `docs/BACKEND_INTEGRATION_CONTRACT.md` §2.10 states the reason plainly: `agents.updated_at`
   *"does not move when a child row changes, which is most config edits"*. Two people editing
   different schedules would both pass an `updated_at` check and the second would clobber the
   first. Send `If-Match: W/"<agentId>:<configRevision>"` — the same weak ETag the manifest uses —
   and increment `config_revision` in the **same transaction** as any write to the agent's brief,
   settings, tasks, skills, context items, schedules or channel links. A `409` renders a
   non-destructive banner: *"Ada was changed elsewhere. [Review differences] [Overwrite]"*. Never
   silently clobber — an agent's config is shared workspace state.
7. **Autosave is deliberately not offered.** A half-typed rule pushed to a live agent is a
   production incident. *Rejected: debounced autosave with an undo toast.*

## E.4 Validation

Client-side mirror of the Zod schemas in `lib/validation.ts` — same messages, same field paths, so
a server rejection lands on the same field the client would have flagged.

| field | rule | message key |
|---|---|---|
| name | 1–64 chars, trimmed non-empty | `errName` |
| instructions | ≤ 8000 chars | `errInstructionsLong` |
| rules[].text | 1–280 chars each, ≤ 50 rules | `errRuleLong` / `errRuleCount` |
| approvalAmount | integer ≥ 0 | `errApprovalInt` |
| dailyActionLimit | integer ≥ 0 | `errLimitInt` |
| temperature | 0–1 | `errTemperature` |
| maxTokens | 256–200000 | `errMaxTokens` |
| escalateTo | RFC5322-ish or empty | `errEmail` |
| schedules[].cron | parses in `lib/schedule/cron.ts`; the rejected forms of §2.7 (`@daily`, seconds field, `L`/`W`/`#`) get their own message | `errCron` / `errCronUnsupported` |
| schedules[].timezone | resolves in `new Intl.DateTimeFormat(undefined, { timeZone })` **inside try/catch** — *not* membership of `Intl.supportedValuesOf("timeZone")`, which omits IANA link names like `Asia/Calcutta` and would reject a timezone already stored on a live agent | `errTimezone` |
| schedules[].name | 1–120 chars (`varchar(120)`) | `errScheduleName` |
| schedules[].prompt | 1–4000 chars, non-empty — the column is `NOT NULL` and a schedule with no instruction is a no-op run that still costs credits | `errSchedulePrompt` |
| context item | ≤ 20 MB, and ≤ the template's `maxBytes` when materialised from one; MIME in the §6.6 allowlist | `errContextTooLarge` / `errContextType` |
| context total | ≤ 50 items, ≤ 100 MB per agent | `errContextQuota` |
| skills | ≤ 12 attached; no `high` without `risk_acknowledged` | `errSkillCount` / `errSkillRisk` |

**Client validation is a mirror, never the control.** Every rule above is enforced by the Zod v4
schema in `lib/validation.ts` on the server; the client copy exists so the message lands on the
field before a round-trip. Anything only the client checks is not checked.

Errors render **below** the field in `c.red` at 12px, with `aria-describedby` wiring and
`aria-invalid="true"`. The save bar shows `⚠ 2 problems` and its Save button is disabled;
pressing the count focuses the first invalid field.

## E.5 Save and re-sync — the part that is currently broken

`Save & re-sync` is two operations and the UI must show both, because only the first is guaranteed.

```
  1. PATCH /api/agents/{id}          → Postgres. Always succeeds or shows a field error.
  2. push to the runtime             → today, a 404 swallowed by an empty catch.
```

**Required behaviour:**

```
 ┌ save bar, during ────────────────────────────────────────────────────────────────────┐
 │  ◐ Saving…                                                     [ Discard ] [ Saving ]│
 ├ after, both succeeded ───────────────────────────────────────────────────────────────┤
 │  ✓ Saved and pushed to Ada · 14:22                                                    │  c.green
 ├ after, DB ok + runtime unreachable ──────────────────────────────────────────────────┤
 │  ⚠ Saved. Ada is still running the previous configuration.                            │  c.amber
 │    We'll retry automatically. [ Retry now ]  [ What does this mean? ]                 │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

The RUNTIME section gains a **`Config in sync`** row. Its two inputs are already specified by
`docs/BACKEND_INTEGRATION_CONTRACT.md`, and neither is a column called `config_synced_at`:

- **`agents.config_revision`** (§2.2) — the revision ArkAgent has written. `integer NOT NULL
  DEFAULT 1`, incremented in the same transaction as any config write, child tables included.
- **the revision the runtime has *applied***, which arrives on `agent.heartbeat` as
  `configRevision` (§5.2 step 7). Two columns are needed to hold it and neither exists yet — add
  them beside `last_heartbeat_at`:

```sql
ALTER TABLE agents
  ADD COLUMN config_applied_revision integer,      -- last heartbeat's configRevision; NULL = never reported
  ADD COLUMN config_applied_at       timestamptz;  -- when that heartbeat arrived
```

The row then reads: green `✓ in sync · rev 14 · 14:22` when
`config_applied_revision >= config_revision`; amber `⚠ pending since 14:22 · rev 14 → 13` when it
is behind; and `· not reported` in `c.muted` when it is NULL, which is the honest state until the
runtime implements the field (§5.2 marks it SHOULD, not MUST). Step 2 of §5.2 is the actual push —
`POST /api/instances/{instanceId}/resync` with `{revision, reason}`, a **nudge carrying no
configuration** — and a `501` from it means "unimplemented", which is a different message from a
network failure and must not read as an error the user caused. **The empty catch at
`app/api/agents/[id]/route.ts:91` must be removed** and each of those outcomes surfaced here.

With `AGENT_MANAGER_MODE != "live"`, step 2 is skipped and the bar reads
`✓ Saved. Runtime is in simulator mode — nothing was pushed.` in `c.muted`. Honest, not alarming.

## E.6 `AgentConfigDTO`

```ts
export interface AgentConfigDTO {
  id: string;
  updatedAt: string;
  /** agents.config_revision. THIS is the If-Match value, not updatedAt — see E.3 rule 6. */
  configRevision: number;
  /** agents.config_applied_revision — from agent.heartbeat. null = never reported. */
  configAppliedRevision: number | null;
  configAppliedAt: string | null;

  identity: { name: string; roleId: string; roleName: string; planTier: PlanTier; hue: string };
  brief: {
    instructions: string;
    tone: Tone;
    responseLanguage: ResponseLanguage;
    timezone: string;
  };
  rules: { id: string; kind: "must" | "never" | "escalate"; text: string; sortOrder: number }[];
  autonomy: {
    level: Autonomy;
    approvalAmount: number;
    approveExternalSends: boolean;
    dailyActionLimit: number;
  };
  skills: {
    id: string;                      // agent_skills.id
    skillId: string;
    /** Identity is (source, ownerHandle, slug) — a bare slug resolves six ways. */
    slug: string; ownerHandle: string; source: string; publicId: string;
    version: string;                 // PINNED, never "latest"
    name: string;
    riskLevel: "low" | "medium" | "high";
    riskLevelAtAttach: "low" | "medium" | "high";
    riskAcknowledged: boolean;
    enabled: boolean;
    /** Install lifecycle — agent_skills.state (type `agent_skill_state`; NOT
     *  `status`, see TASK_PLAN_V2 §1 conflict C1). Without it a skill that FAILED to
     *  install renders identically to one that is running. */
    status: "pending" | "installing" | "installed" | "failed" | "removing" | "removed";
    installError: string | null;
    /** "live" | "mock" — a mock-mode row must never read as a real installation. */
    installSource: "live" | "mock";
    /** The engine this attachment was asserted against (agent_skills.harness).
     *  When it !== harness.engine the row renders NEEDS RECHECK. */
    assertedHarness: Harness;
    /** agent_skills.compat_asserted. THREE display states, not two:
     *  asserted true => ✓; false + a provably unmet requirement => ✕;
     *  false + basis "unknown" => ⚠. Never collapse ⚠ into either (RISKS R4). */
    compatAsserted: boolean;
    compatBasis: "asserted" | "inferred" | "unknown";
    unmetRequirements: string[];     // e.g. ["bin:gh>=2.40", "env:GH_TOKEN"]
    /** skills.blocked — withdrawn after attachment. Renders a removal prompt. */
    blocked: boolean;
    updateAvailable: string | null;  // newer version from skills.known_versions, or null
  }[];
  context: {
    id: string;
    /** context_item_kind: file | text | url. NOT "link". */
    kind: "file" | "text" | "url";
    /** agent_context_items.name. */
    title: string;
    mime: string | null;
    bytes: number;                   // NOT NULL DEFAULT 0; 0 while awaiting_upload
    /** source_url for kind="url". Rendered as TEXT, never as an href (C.3.3). */
    sourceUrl: string | null;
    /** context_item_state. The column is `state`, not `status`, and
     *  awaiting_upload is a real UI state (a template's context placeholder). */
    state: "awaiting_upload" | "pending" | "indexing" | "indexed" | "failed" | "removed";
    stateError: string | null;
    chunks: number | null;
    createdAt: string;
  }[];
  schedules: {
    id: string;
    /** agent_schedules.name — the column is `name`; `label` is a display word. */
    name: string;
    kind: "cron" | "interval" | "once";
    cronExpr: string | null;         // agent_schedules.cron_expr; null unless kind="cron"
    intervalSeconds: number | null;
    runAt: string | null;
    timezone: string;
    /** Localised by lib/schedule/describe server-side so all 4 langs agree. */
    human: string;
    /** agent_schedules.prompt — the instruction, injected as a USER turn. */
    prompt: string;
    deliverTo: "chat" | "email" | "channel" | "none";
    maxRunsPerDay: number;           // 1..288
    enabled: boolean;
    nextRunAt: string | null;
    lastRunAt: string | null;
    /** agent_schedules.last_status, varchar(24) — from agent_schedule_runs.status. */
    lastStatus: "started" | "succeeded" | "failed" | "skipped" | null;
  }[];
  harness: {
    engine: Harness;
    model: string;
    temperature: number;
    maxTokens: number;
    reasoningEffort: ReasoningEffort;
    tools: AgentSettings["tools"];
    memoryEnabled: boolean;
    retentionDays: number;
    selfImprove: boolean;
    autoCreateSkills: boolean;
  };
  limits: {
    monthlyCreditCap: number;
    escalateTo: string;
    notifyNeedsReview: boolean;
    notifyErrors: boolean;
    dailyDigest: boolean;
    digestTime: string;
  };
  runtime: {
    /** The EXISTING agent_status pgEnum: draft | provisioning | deploying | working |
     *  scheduled | needs_review | paused | error | terminated. There is no
     *  "running" value — the UI word for `working` is a label, not a status id. */
    status: AgentStatus;
    deploymentStatus: string | null; // the runtime's own free-text sub-state
    vmId: string | null;
    vmRegion: string | null;
    instanceUuid: string | null;
    uptimeStartedAt: string | null;
    lastHeartbeatAt: string | null;
    lastError: string | null;
    managerMode: "live" | "mock" | "unconfigured";
  };
}
```

**Nothing in this DTO may carry a secret.** `agent_skills.config` holds environment-variable
**names** and non-secret values only (`docs/SKILL_REPOSITORY.md` §1.4), enforced by a `.strict()`
Zod schema that rejects any key matching `/token|secret|key|password/i`, mirroring the mask at
`lib/serializers.ts:98`. The value of `GH_TOKEN` is set in the runtime's own store and never
round-trips through this API — which is why D.3's REQUIREMENTS block says *"you must provide"* and
offers no input. `agent_manager_config.config` (the opaque upstream blob) is never serialised into
`AgentConfigDTO` at all.

---

# F. ACTIVITY — `/dashboard/fleet/[id]?tab=activity`

## F.0 What exists and what it must become

`ActivityTab` (`app/dashboard/fleet/[id]/page.tsx:50-108`) is 58 lines: a flat list of
`{ clock, text, tag }` from `agent_activities`, no filters, no grouping, no drill-down, no
pagination. And per `docs/research/RUNTIME_INTEGRATION.md` §2.3, **nothing upstream writes to it** —
every row today is ArkAgent's own bookkeeping ("OpenClaw instance created…").

The v2 page is four views over three new tables (`agent_runs`, `agent_run_steps`,
`agent_health_samples`) plus the existing `agent_activities` and `llm_usage`. **The DDL and the
enums are `docs/BACKEND_INTEGRATION_CONTRACT.md` §3.2–§3.3 and they are the definition** — do not
invent values here, and do not *drop* values either, which is the subtler failure: an earlier draft
of this section omitted four real enum members (`run_trigger.system`, `run_status.queued`,
`run_status.timeout`, `run_step_phase.message`) and one real `kind` (`mcp`), so any row carrying one
would have fallen through every branch and rendered blank.

```
 ┌ tabs within Activity ─────────────────────────────────────────────────────────┐
 │  ▸TIMELINE◂    RUNS    HEALTH    COST                                         │  mono 12, active w.monoStrong
 └───────────────────────────────────────────────────────────────────────────────┘
```

## F.1 TIMELINE

A day-grouped stream that merges runs and activities, because "what did it do today" is one
question and the user should not have to know which table an event came from.

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ ┌ 300 ─────┐┌ 140 ────┐┌ 140 ────┐┌ 150 ────┐              ┌ 120 ┐ ┌ 96 ┐            │
 │ │⌕ Search  ││ Trigger▾││ Outcome▾││ Tag    ▾│              │Last 7d▾│ ⟳ Live│         │  ⟳ Live = SSE on/off
 │ └──────────┘└─────────┘└─────────┘└─────────┘              └──────┘ └──────┘         │
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │  TODAY · Sat 29 Aug                          14 runs · 12 ok · 1 failed · 1 running   │  sticky day header
 │                                              mono 11 / w.monoStrong / c.muted         │  c.glass bg, 1px c.line under
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │ 14:22:04 │ ◷ │ Morning sweep                                     7 steps  41s  ▸     │  RUN row, h 52
 │          │   │ Drafted 3 replies, escalated 1                    ✓ succeeded   $0.014│
 │          │   │ ↑ font.sans 13.5 / w.body / c.text2 ·  status mono 11 c.green         │
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │ 14:18:51 │ ⌁ │ Replied to Chen Wei on WeChat                              outreach   │  ACTIVITY row, h 40
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │ 13:04:12 │ ⚑ │ Escalated: quote above $300                                review     │  tag colour from tagColor()
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │ 12:00:00 │ ◷ │ Inbox poll                                       3 steps  8s   ▸     │
 │          │   │ ▲ failed — CRM returned 401                      ✕ failed      $0.002│  failed row: borderLeft 2px c.red
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │  FRI 28 AUG                                  18 runs · 18 ok                          │
 │  …                                                                                    │
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │                          [ Load 50 more ]                                             │  keyset pagination, not offset
 └──────────────────────────────────────────────────────────────────────────────────────┘
   columns: time 76 · glyph 24 · body auto · meta 200 (right-aligned)
```

**Trigger glyphs** (one column, so the eye can scan cause):

| trigger | glyph | colour | source |
|---|---|---|---|
| `schedule` | `◷` | `c.accent` | `agent_runs.trigger` |
| `chat` | `✎` | `c.blue` | |
| `channel` | `⌁` | `c.text2` | |
| `api` | `⎇` | `c.muted` | |
| `self` | `↻` | `c.amber` | |
| `system` | `⚙` | `c.muted` | the sixth value of `run_trigger`; ArkAgent's own maintenance runs |
| *(activity, not a run)* | tag glyph | `tagColor(tag)` | `agent_activities.tag` |

**Filters** map to query params on `GET /api/agents/[id]/activity`:
`?q=&trigger=&outcome=&tag=&from=&to=&cursor=&limit=50`. Outcome is the full six-value
`run_status`: `queued · running · succeeded · failed · cancelled · timeout`. `queued` and `timeout`
are not optional garnish — `timeout` is what `max_runtime_seconds` produces and it is the single
most support-generating outcome, so it gets its own glyph (`⏱`, `c.amber`) and its own filter chip
rather than being folded into `failed`. Tag is the existing 14-value `activityTagEnum`.

**`q` is escaped before it reaches SQL.** The search is an `ILIKE` over `summary` and
`agent_activities.text`; `%`, `_` and `\` must be escaped exactly as
`app/api/admin/users/route.ts:27` already does, or `?q=%` is an unbounded sequential scan any
signed-in user can fire.

**Live mode.** `⟳ Live` subscribes to `GET /api/agents/[id]/activity/stream` (SSE, `EventSource` —
it is a GET, so unlike C.2 it can be). New rows insert at the top with the existing `riseIn`
keyframe (`globals.css:861`), suppressed under `prefers-reduced-motion`. When the tab is hidden the
stream is closed and a *"N new since you looked away"* pill appears on return rather than a silent
jump. Live is **off by default** on mobile to protect battery and data.

**The stream is bounded, and the client must expect it to end.** A serverless function cannot hold
a connection indefinitely — the route caps itself at **60s** and closes cleanly with a final
`event: bye` carrying the latest cursor; `EventSource` then reconnects on its own and the handler
resumes from that cursor via `Last-Event-ID`. Without the cap, one open tab pins a function
instance until the platform kills it mid-frame and the user sees a gap. Each frame carries an
`id:` so `Last-Event-ID` is meaningful, and the route sends `: ping` every 15s. A stream that
cannot be resumed is worse than polling; if the deployment target makes the above impractical,
poll the same endpoint every 10s instead and keep the identical UI.

**Failure state.** A failed fetch is not an empty timeline. `⚠ Couldn't load activity.` +
`[ Try again ]`, with the filters left as the user set them. Showing an empty stream over a failed
request tells the user their agent did nothing, which is a lie.

**Empty state**, and it must be accurate about *why*:

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │                                    ◷                                                  │
 │                        Nothing yet today                                              │
 │      Ada is working but hasn't been triggered. Its next scheduled run is              │  font.sans 14 / w.body / c.muted
 │      Mon 1 Sep at 08:30.                                                              │
 │                            [ Run it now ]   [ Open chat ]                             │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

If `runtime.managerMode !== "live"`, the empty state says so instead: *"The runtime is in
simulator mode, so no real activity is recorded."* Do not show a hopeful empty state over a
disconnected backend.

## F.2 RUNS — the drill-down and the step trace

Clicking a run row (or `▸`) opens the run detail. On ≥1280px it is a **right pane inside the tab**
(`--r-activity: 1fr 520px`) so the timeline stays visible; below that it is a full-width push view
with a back link.

```
 ┌ 520 ────────────────────────────────────────────────────────────────┐
 │  ◷  Morning sweep                                    ✓ succeeded  ✕ │  font.space 16 / w.strong
 │  run_9f2a1c4e · schedule · agent:main:web                            │  mono 11 / w.monoLabel / c.faint, selectable
 │  14:22:04 → 14:22:45  ·  41.2s  ·  7 steps  ·  16,586 tok  ·  $0.014 │  mono 11.5 / c.muted
 ├──────────────────────────────────────────────────────────────────────┤
 │  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  │  ← duration ribbon, one segment per step
 │  ░thinking░ ▓browser▓ ░think░ ▓http▓ ▓skill▓ ░think░ ▓message▓       │  width ∝ duration_ms; hover shows the step
 ├──────────────────────────────────────────────────────────────────────┤
 │  ▾ 1  ◇ thinking            model         2.1s        4,102 → 88 tok │  step row h 40 collapsed
 │       Planning: check inbox, dedupe, research each sender            │  detail on expand
 │  ▾ 2  ▶ tool_call           browser       1.2s                    ✓ │
 │       GET https://mail.example.com/inbox                             │  title mono 12 / w.monoLabel / c.text2
 │  ▾ 3  ◀ tool_result         browser       —                       ✓ │
 │       ┌────────────────────────────────────────────────────────────┐ │
 │       │ 4 new messages                                             │ │  detail: c.panelDeep, mono 11.5,
 │       │ …                                                          │ │  max-h 240 + .ark-scroll, `Copy` on hover
 │       └────────────────────────────────────────────────────────────┘ │
 │  ▾ 4  ▶ tool_call           http          0.4s                    ✕ │  error step: borderLeft 2px c.red
 │       POST https://crm.example.com/v1/contacts                       │
 │       ┌────────────────────────────────────────────────────────────┐ │
 │       │ 401 Unauthorized — token expired                           │ │  c.redWash bg, c.red text
 │       └────────────────────────────────────────────────────────────┘ │
 │  ▾ 5  ◆ tool_call           skill         6.8s                    ✓ │
 │       lead-enrichment@1.4.0                                          │  skill steps link to the D.3 drawer
 │  ▾ 6  ◇ thinking            model         1.9s        1,204 → 61 tok │
 │  ▾ 7  ✔ final_answer        message       0.2s                    ✓ │
 │       Drafted 3 replies, escalated 1                                 │
 ├──────────────────────────────────────────────────────────────────────┤
 │  [ Copy run id ]   [ Export JSON ]   [ Re-run ]                      │  Re-run only when trigger ∈ {schedule, api}
 └──────────────────────────────────────────────────────────────────────┘
```

**Phase glyphs**, fixed to the `run_step_phase` enum (`docs/BACKEND_INTEGRATION_CONTRACT.md`
§2.1) — phase is *what kind of moment*, kind is *what tool*:

| `phase` | glyph | colour |
|---|---|---|
| `thinking` | `◇` | `c.muted` |
| `tool_call` | `▶` | `c.accent` |
| `tool_result` | `◀` | `c.text2` |
| `message` | `✎` | `c.blue` — an intermediate utterance to the user, mid-run |
| `final_answer` | `✔` | `c.green` |

**There are five phases, not four.** `message` and `final_answer` are different moments and the
enum carries both; a renderer with four branches drops every intermediate message on the floor.
Note also that `message` appears in *both* vocabularies — as a phase (an utterance) and as a kind
(the transport). That collision is upstream's, and the row must therefore never infer one from the
other.

`kind` renders as a mono 11 label in `c.muted`: `shell · browser · file · http · skill · message ·
model · mcp`. **`mcp` is a real value** and `kind` is a nullable `varchar(32)`, not an enum — so
the renderer needs a fallback that prints an unknown kind verbatim rather than blanking the cell,
and a null renders as `—`. Never colour-code `kind` as well as `phase`: two colour systems on one
row is unreadable.

**Expand/collapse:** `<details>` per step. `Expand all` / `Collapse all` in the header.
Error steps are expanded by default; everything else is collapsed. Step `detail` is truncated
server-side to 8 KB with a `truncated: true` flag and a *"…truncated"* footer, so one runaway
`stdout` cannot blow up the response.

**A run that is still `running`** streams its steps in over the same SSE channel, with the last row
showing `◐` and a live elapsed counter. The duration ribbon grows. A run at `queued` has no steps
yet and shows `· waiting to start`; a run that ended `timeout` shows the elapsed time against
`max_runtime_seconds` so the cause is legible without opening the schedule.

**Every step field is untrusted output.** `title` and `detail` are produced by a model driving
third-party tools — a fetched web page's contents land in a `tool_result` `detail` verbatim. They
render as text nodes inside `<pre>`; nothing on this page interprets them, no URL in them becomes
an `href`, and the 8 KB server-side truncation is a resource control, not a sanitiser.

## F.3 HEALTH

Fed by `agent_health_samples` (§3.6). Four sparkline cards over a state strip.

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │  ┌ state strip, 1 cell per 5-minute bucket over the selected range ─────────────────┐ │
 │  │ ▇▇▇▇▇▇▇▇▁▁▁▁▇▇▇▇▇▇▇▇▇▇▇▇▇▇▓▓▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇ │ │  h 28
 │  │ ▇ running c.green  ▁ idle c.line  ▓ unhealthy c.amber  █ stopped c.faint         │ │  gaps = no sample: c.panelDeep
 │  └──────────────────────────────────────────────────────────────────────────────────┘ │
 │  00:00                          12:00                                        23:59   │  mono 10 / c.faint
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │ ┌ 4 up, --r-col-4 ────────────────────────────────────────────────────────────────┐  │
 │ │ CPU              │ MEMORY            │ DISK              │ UPTIME               │  │  label mono 10 / w.monoLabel / c.muted
 │ │ 12 %             │ 812 MB / 4 GB     │ 3.2 GB            │ 3d 4h 12m            │  │  value font.space 22 / w.display / c.text
 │ │ ╱╲__╱╲_╱╲__      │ ▁▂▃▃▄▄▄▅▅▅▅▅      │ ▁▁▂▂▂▃▃▃▃▄▄▄      │ since 26 Aug 09:58    │  │  spark h 32, stroke c.accent 1.5px
 │ │ peak 61% 09:14   │ peak 1.9 GB       │ +0.4 GB in 7d     │ 2 restarts in 7d      │  │  foot mono 11 / c.muted
 │ │  ↑ cpu_percent is an INTEGER upstream — "12.4 %" implies a precision that                │  MEMORY has a limit column;
 │ │    does not exist. DISK has no limit column, so no percentage.                           │  DISK does not.
 │ └─────────────────────────────────────────────────────────────────────────────────┘  │
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │  LIVENESS                                                                             │
 │   Last heartbeat   14:24:03  (37s ago)                            ✓                   │  mono 12.5 / c.text2
 │   Active runs      1                                                                  │  stale > 3× heartbeatMinutes → ⚠ c.amber
 │   Last activity    14:22:45                                                           │  > 10× → ▲ c.red
 │   Config in sync   ✓ revision 14 · pushed 14:22                                       │  ← the E.5 signal, surfaced here too
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

Sparklines are inline `<svg>` with a `<title>` and an adjacent visually-hidden table of the same
numbers — a chart nobody can read with a screen reader is not an accessibility feature (I.4).

**No samples yet** — very likely at launch, since §3.6 is PROPOSED and unimplemented upstream:

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │  No health data                                                                      │
 │  This agent's runtime hasn't reported health samples. Liveness below is derived       │  font.sans 14 / w.body / c.muted
 │  from heartbeats only.                                                                │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

The LIVENESS block still renders from `agents.last_heartbeat_at`, so the view is never empty.

## F.4 COST

Reads `llm_usage` (per-run token accounting) and `usage_records` (credits). It answers three
questions and nothing else: *what did this cost, what drove it, and is it trending up.*

```
 ┌──────────────────────────────────────────────────────────────────────────────────────┐
 │ ┌ 140 ────┐                                                     ┌ 160 ┐              │
 │ │Last 30d▾│                                                     │ by run ▾│           │  group: by run · by trigger · by model · by skill
 │ └─────────┘                                                     └──────┘              │
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │ ┌ 3 up ───────────────────────────────────────────────────────────────────────────┐  │
 │ │ SPEND (30d)        │ RUNS               │ COST / RUN                            │  │
 │ │ $4.82              │ 412                │ $0.0117                               │  │  font.space 26 / w.display
 │ │ ▲ 18% vs prev 30d  │ ▲ 9%               │ ▲ 8%                                  │  │  delta mono 11: ▲ c.amber ▼ c.green
 │ └────────────────────────────────────────────────────────────────────────────────┘  │
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │  DAILY SPEND                                                                          │
 │  ▁▂▁▃▂▂▅▃▂▂▁▃▄▂▂▃▇▃▂▂▁▂▃▄▅▃▂▂▃▄                                                      │  bars c.accent; hovered bar c.text
 │  1 Aug                                             29 Aug                            │  keyboard: ←/→ moves a cursor, value in aria-live
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │  BY TRIGGER                        TOKENS        COST        SHARE                    │
 │   ◷ schedule            308 runs  1.94 M     $3.61      ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ 75%        │  bar c.accent on c.line
 │   ✎ chat                 74 runs  0.51 M     $0.94      ▓▓▓▓░░░░░░░░░░░░░ 19%        │
 │   ⌁ channel              28 runs  0.14 M     $0.24      ▓░░░░░░░░░░░░░░░░  5%        │
 │   ⎇ api                   2 runs  0.01 M     $0.03      ░░░░░░░░░░░░░░░░░  1%        │
 ├──────────────────────────────────────────────────────────────────────────────────────┤
 │  MOST EXPENSIVE RUNS                                                                  │
 │   14:22 Morning sweep       41s   16,586 tok   $0.014   ✓                        ▸   │  rows link into F.2
 │   09:14 Competitor scan    182s   84,201 tok   $0.071   ✓                        ▸   │
 └──────────────────────────────────────────────────────────────────────────────────────┘
```

Money is formatted through the existing currency machinery (`lib/pricing`, `CurrencySwitcher`) —
never a hardcoded `$`. **Sum in micro-USD and convert once at the edge**: summing per-run values
already rounded to cents turns a 412-run month into a number that is wrong by more than the total.
Token counts use `fmtCompact` (`fleet/[id]/page.tsx:894`), already written; `fmtInt`
(`:878`) hardcodes `toLocaleString("en-US")` and must take the BCP47 tag (§J).

**The cheap interim win named in §3.2 unblocks this whole view without any upstream change, and it
is real code:** `streamOpenclawReply` (`app/api/agents/[id]/messages/route.ts:183`) receives a
`StreamChatHandle` carrying `responseId` (`app/lib/openclaw_manager_api.ts:393`) and
`finalResponse.usage` — `{ inputTokens, outputTokens, totalTokens }` (`:371-375`) — and discards
both; today they reach only a `console.log` behind `OPENCLAW_DEBUG_LOG`. Persisting an `agent_runs`
row keyed on `(agentId, responseId)` — which is exactly what the `agent_runs_external_uniq` index
expects — plus an `llm_usage` row makes COST and the `chat`-triggered half of TIMELINE real against
**today's** Manager. Ship it in v2.0 regardless of what the backend team commits to.

**One honest gap in that win:** the Manager's `usage` carries tokens but no cost, and the model is
the Manager's, not one we priced. `cost_micro_usd` is therefore `0` with `llm_usage.estimated =
true` until a price table covers `finalResponse.model`. The COST view must render an estimated or
absent cost as `—` with a footnote, never as `$0.00`, which reads as "this was free".

## F.5 Activity DTOs

```ts
// Mirror of the pgEnums in docs/BACKEND_INTEGRATION_CONTRACT.md §2.1. Every member,
// or a row carrying the missing one renders blank.
export type RunTrigger = "chat" | "schedule" | "channel" | "api" | "self" | "system";
export type RunStatus =
  | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timeout";
export type StepPhase =
  | "thinking" | "tool_call" | "tool_result" | "message" | "final_answer";
/** agent_run_steps.kind is a NULLABLE varchar(32), not an enum — treat unknown
 *  values as data to print, not as a parse failure. */
export type StepKind =
  | "shell" | "browser" | "file" | "http" | "skill" | "message" | "model" | "mcp";

/** One row in the merged timeline. Discriminated so the renderer never guesses. */
export type TimelineItemDTO =
  | {
      type: "run";
      id: string; runId: string;
      trigger: RunTrigger; triggerRef: string | null; triggerLabel: string | null;
      status: RunStatus;
      summary: string | null;
      errorCode: string | null; errorMessage: string | null;
      startedAt: string; finishedAt: string | null; durationMs: number | null;
      stepCount: number;
      /** agent_runs.cost_micro_usd is MICRO-USD (1e-6), matching llm_usage.cost_micro_usd
       *  and its comment "keeps sub-cent costs exact without a numeric type"
       *  (lib/db/schema.ts:744). An integer of MINOR units (cents) cannot express the
       *  $0.014 and $0.0117 this page renders — an earlier draft's `costMinor` would
       *  have rounded every per-run cost in the product to 1c or 0c. Convert to the
       *  display currency at render through lib/pricing; never store a converted value. */
      usage: {
        inputTokens: number; outputTokens: number;
        cacheTokens: number; totalTokens: number;
        costMicroUsd: number;
        model: string | null;
      } | null;
    }
  | {
      type: "activity";
      id: string;
      /**
       * `agent_activities.code` — the v2 structured vocabulary
       * (BACKEND_INTEGRATION_CONTRACT §3.4, `agent.activity` v2). NON-NULL means
       * render from `code` + `params` through lib/i18n/activity.ts. It is null only
       * for pre-v2 rows and for code='custom'.
       */
      code: string | null;
      /** Interpolation values for `code`. Untrusted runtime data: text nodes only. */
      params: Record<string, string | number>;
      /**
       * `agent_activities.text`. Written as '' whenever `code` is set, precisely so
       * that one row reads correctly to members using four different languages —
       * rendering prose at ingest would freeze one of them in forever, which is the
       * defect the v2 event exists to remove. Render this ONLY when `code` is null.
       */
      text: string;
      tag: ActivityTag;              // the existing 14-value enum
      /** Correlates the line to its run, so the timeline can nest it. */
      runId: string | null;
      occurredAt: string;
    };

export interface RunStepDTO {
  id: string;
  /** agent_run_steps.idx — the column is `idx`; `index` is a JS keyword-ish trap
   *  and the DDL avoided it deliberately. */
  index: number;
  phase: StepPhase;
  /** Nullable in the DDL. Unknown strings print verbatim; null prints "—". */
  kind: StepKind | string | null;
  title: string;
  detail: string | null; detailTruncated: boolean;
  status: "ok" | "error";
  /** The column is `agent_run_steps.occurred_at`. There is no `started_at` on a step —
   *  only `agent_runs` has one — and naming the DTO field `startedAt` invited exactly
   *  the mis-join that would silently order the step trace by the run's clock. */
  occurredAt: string; durationMs: number | null;
  usage: { inputTokens: number; outputTokens: number } | null;
  /** Set when kind === "skill", so the row can open the skill drawer. */
  skillRef: { slug: string; ownerHandle: string; version: string } | null;
}

export interface HealthSampleDTO {
  ts: string;                        // agent_health_samples.sampled_at
  /** varchar(16), not a pgEnum: running | idle | stopped | unhealthy. Distinct
   *  from agents.status, which has nine values and no "running" — do not mix them. */
  state: "running" | "idle" | "stopped" | "unhealthy";
  cpuPercent: number | null;         // 0..100, integer, rounded upstream
  memoryBytes: number | null; memoryLimitBytes: number | null;
  /** There is NO disk_limit_bytes column (§3.3). The DISK card therefore shows an
   *  absolute figure, never "74 % of 4.3 GB" — a percentage of an unknown
   *  denominator is a fabricated number. Add the column upstream or drop the ratio. */
  diskUsedBytes: number | null;
  uptimeSeconds: number | null;
  activeRuns: number;                // NOT NULL DEFAULT 0
  /** "runtime" | "mock". A mock sample must never be charted as a real one. */
  source: "runtime" | "mock";
}
```

---

# G. COMPONENT INVENTORY

Every component below is a client component in `components/`, styled with **inline style objects
reading `c.*` / `font.*` / `w.*` / `r.*`**. None introduces a class name except the four already
sanctioned by `globals.css` (`.ark-scroll`, `.r-mobile-only`, `.r-dash-sidebar`, `.r-scrim`) and
the **three** new ones — `.ark-hscroll` and `.ark-clamp` in H.4, `.sr-only` in I.3. None takes a
`className` prop — that would be a door to a second styling system. Hover and press feedback goes
through the existing `Btn` / `HoverDiv` (`components/ui.tsx`), never a `:hover` rule.

**Two mechanics the inline idiom does not cover on its own**, both needed by components below:

- **Custom properties in a style object.** `.ark-clamp` reads `--lines` from the element's own
  inline style, and React's `CSSProperties` has no index signature for `--*`. The call site is
  `style={{ "--lines": 2 } as CSSProperties}` — one cast, at the call site, the same shape as
  `r.sidebarPos`. Do not widen the shared type to `Record<string, string>`.
- **Server/client split.** Every component here is `"use client"` and none may import from
  `lib/services/**` or anything carrying `import "server-only"`. The DTOs in B.10, E.6 and F.5 are
  the whole interface; `lib/serializers.ts` is where the boundary is crossed.

## G.1 Promoted from `app/dashboard/fleet/[id]/page.tsx` (move, do not rewrite)

These already exist and are used by C.3, E.2 and D. Moving them out of a 3,730-line page file is a
prerequisite, not a nice-to-have.

| new file | from | change |
|---|---|---|
| `components/SectionCard.tsx` | `SettingCard` `:1439` | + `headerAction?: ReactNode`, `state?: "ok"\|"edited"\|"invalid"`, `id?: string` (anchor target) |
| `components/Field.tsx` | `Field` `:1491` | + `error?: string`, `dirty?: boolean`, `onRevert?: () => void`, `required?: boolean`; wires `aria-describedby` / `aria-invalid` |
| `components/Toggle.tsx` | `Toggle` `:1501` | + `disabled`, `id`; `role="switch"` and `aria-checked` instead of `aria-pressed` |
| `components/Seg.tsx` | `Seg` `:1551` | + `ariaLabel`, roving-tabindex arrow keys, `role="radiogroup"` |
| `components/SelectField.tsx` | `SelectField` `:1588` | + `disabled`, `id`, `optionGroups?` |
| `components/Chip.tsx` | `Chip` `:1612` | + `tone?: "neutral"\|"accent"\|"risk"`, `removable?: boolean` |
| `components/sInput.ts` | `sInput` `:1427`, `sLabel` `:1419` | `sInput.borderColor` → `c.borderField`; `sLabel.color` → `c.muted`, `fontWeight: w.monoStrong` |

## G.2 New primitives

```ts
// components/ViewToggle.tsx  — B.2, D.0
export function ViewToggle({ value, onChange, storageKey, labels }: {
  value: "grid" | "list";
  onChange: (v: "grid" | "list") => void;
  /** localStorage key. Templates: "ark-view:templates". Skills: "ark-skills-view"
   *  — that exact string is fixed by docs/SKILL_REPOSITORY.md §7.3 and must not be
   *  normalised to match the other one. Read after mount only, inside try/catch:
   *  a private window throws on access rather than returning null. */
  storageKey: string;
  /** Accessible names, from the screen's dictionary. */
  labels: { grid: string; list: string; group: string };
}): JSX.Element;
// role="radiogroup" + two role="radio" buttons; ←/→ switch; 76×38.

// components/FilterSelect.tsx  — B.2, D.0, F.1
export function FilterSelect<T extends string>({
  label, value, options, onChange, multi = false, width = 150, pinned,
}: {
  label: string;
  value: T[];                        // always an array; single-select uses length<=1
  options: { id: T; label: string; count?: number; disabled?: boolean }[];
  onChange: (v: T[]) => void;
  multi?: boolean;
  width?: number;
  /** ids rendered above the divider, e.g. ["agent-meta","security-secrets"]. */
  pinned?: T[];
}): JSX.Element;
// Built on MenuPopover; adds checkboxes when multi, a count badge on the trigger.

// components/SearchField.tsx
export function SearchField({ value, onChange, placeholder, width = 320, debounceMs = 250 }: {
  value: string; onChange: (v: string) => void; placeholder: string;
  width?: number | string; debounceMs?: number;
}): JSX.Element;
// type="search"; Escape clears; the clear button is a real button with an aria-label.

// components/FilterChips.tsx  — the "active filters" row
export function FilterChips({ chips, onRemove, onClearAll, clearAllLabel }: {
  chips: { key: string; label: string }[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
  clearAllLabel: string;
}): JSX.Element;

// components/Drawer.tsx  — B.5, D.3, F.2 (mobile)
export function Drawer({ open, onClose, title, subtitle, width = "wide", footer, children }: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** "narrow" = var(--r-drawer-w) 640, "wide" = var(--r-drawer-w-wide) 720. */
  width?: "narrow" | "wide";
  footer?: ReactNode;                // rendered in a sticky c.glass bar
  children: ReactNode;
}): JSX.Element | null;
// Extracted from InstanceInfoDrawer (:2620). Owns: scrim, focus trap, Escape,
// aria-modal, inert on the page behind, focus restore, body scroll lock.

// components/ConfirmDialog.tsx  — D.4, E.2 harness change, E.3 navigation guard
export function ConfirmDialog({ open, tone = "neutral", title, body, confirmLabel,
  cancelLabel, requireCheckbox, checkboxLabel, onConfirm, onCancel, busy }: {
  open: boolean;
  tone?: "neutral" | "danger";
  title: string;
  body: ReactNode;
  confirmLabel: string; cancelLabel: string;
  /** When true the confirm button stays disabled until the box is ticked. */
  requireCheckbox?: boolean; checkboxLabel?: string;
  onConfirm: () => void; onCancel: () => void;
  busy?: boolean;
}): JSX.Element | null;
// role="alertdialog", aria-describedby the body; initial focus on Cancel.

// components/RiskPill.tsx  — D.1, D.2, C.3.1
export function RiskPill({ level, size = "sm", label }: {
  level: "low" | "medium" | "high";
  size?: "sm" | "md";
  /** Localised "Low"/"Medium"/"High". */
  label: string;
}): JSX.Element;
// Glyph ● / ◐ / ▲ carries the level independently of hue.

// components/HarnessPill.tsx
export function HarnessPill({ engine, label, compact }: {
  engine: Harness; label: string; compact?: boolean;
}): JSX.Element;

// components/HarnessMatrix.tsx  — D.1 "RUNS ON", D.3
export function HarnessMatrix({ support, labels }: {
  support: Record<Harness, "yes" | "no" | "unknown">;
  labels: Record<Harness, string> & { srPrefix: string };
}): JSX.Element;
// Four fixed slots in enum order; visually-hidden sentence for screen readers.

// components/MetricStrip.tsx  — B.3, D.1
export function MetricStrip({ cells }: {
  cells: { label: string; value: string; title?: string }[];  // 2–4 cells
}): JSX.Element;

// components/EmptyState.tsx  — B.7, D.6, F.1
export function EmptyState({ glyph, title, body, primary, secondary, tone = "neutral" }: {
  glyph: string;
  title: string;
  body: ReactNode;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  /** "info" tints the frame with c.limeWash for a "this is expected" state. */
  tone?: "neutral" | "info";
}): JSX.Element;

// components/CopyButton.tsx  — run ids, sha256, cron
export function CopyButton({ value, label, copiedLabel }: {
  value: string; label: string; copiedLabel: string;
}): JSX.Element;
// aria-live="polite" announcement on copy; reverts after 1.6s.
```

## G.3 New composites

```ts
// components/StageList.tsx  — C.2
export interface Stage {
  id: string; label: string;
  status: "pending" | "active" | "done" | "skipped" | "error";
  detail?: string; result?: string; durationMs?: number;
}
export function StageList({ stages, total }: { stages: Stage[]; total: number }): JSX.Element;
// The active row is aria-live="polite"; the list is role="list" with aria-busy while running.

// components/DirtyBar.tsx  — E.1
export function DirtyBar({ dirtyCount, errorCount, summary, saving, savedAt, syncState,
  onSave, onDiscard, onFocusFirstError, labels }: {
  dirtyCount: number; errorCount: number;
  /** "Brief, Skills, Channels" — already localised and joined by the caller. */
  summary: string;
  saving: boolean;
  savedAt: string | null;
  syncState: "idle" | "pushing" | "synced" | "unreachable" | "simulator";
  onSave: () => void; onDiscard: () => void; onFocusFirstError: () => void;
  labels: DirtyBarLabels;
}): JSX.Element | null;
// Returns null when clean. role="region" aria-label; the count is aria-live="polite".

// components/SectionRail.tsx  — E.1
export function SectionRail({ sections, activeId, onJump, label }: {
  sections: { id: string; label: string; state: "ok" | "edited" | "invalid"; count?: number }[];
  activeId: string;
  onJump: (id: string) => void;
  label: string;                      // nav aria-label
}): JSX.Element;

// components/RuleList.tsx  — C.3.2, E.2
export function RuleList({ rules, onChange, labels, max = 50 }: {
  rules: { id: string; kind: "must" | "never" | "escalate"; text: string }[];
  onChange: (next: RuleList["rules"]) => void;
  labels: RuleLabels;
  max?: number;
}): JSX.Element;
// Reorder: pointer drag OR ↑/↓ while a row is focused. Each move announces
// "Rule 3 of 5, moved up" via a single aria-live region.

// components/ContextItems.tsx  — C.3.3, E.2
export function ContextItems({ items, quota, onUpload, onPaste, onAddLink, onRemove, labels }: {
  items: AgentConfigDTO["context"];
  quota: { items: number; bytes: number; usedItems: number; usedBytes: number };
  onUpload: (files: File[]) => void;
  onPaste: (title: string, body: string) => void;
  /** kind: "url" — the enum value is `url`, not `link`. The component collects the
   *  string and posts it; it never fetches it (C.3.3, SSRF). */
  onAddUrl: (url: string) => void;
  onRemove: (id: string) => void;
  labels: ContextLabels;
}): JSX.Element;
// Contains DropZone; the drop zone is ALSO a <label for> a visually-hidden
// <input type="file" multiple>, so keyboard and screen-reader users get the
// same affordance without a custom key handler.

// components/ScheduleEditor.tsx  — C.3.4, E.2
export function ScheduleEditor({ value, timezones, onChange, onCancel, onSave, labels }: {
  value: AgentConfigDTO["schedules"][number] | null;   // null = new
  timezones: string[];
  onChange: (v: AgentConfigDTO["schedules"][number]) => void;
  onCancel: () => void; onSave: () => void;
  labels: ScheduleLabels;
}): JSX.Element;

// components/CronPreview.tsx  — the block inside ScheduleEditor
export function CronPreview({ cron, timezone, count = 5, locale, labels }: {
  cron: string; timezone: string; count?: number; locale: string;
  labels: { title: string; invalid: string; none: string };
}): JSX.Element;
// Pure: calls lib/schedule/nextRuns. No network, no LLM, works in every mode.

// components/SkillRow.tsx  — C.3.1, D.2, E.2
export function SkillRow({ skill, mode, checked, onToggle, onInfo, onRemove, labels }: {
  skill: AgentConfigDTO["skills"][number] | SkillSummaryDTO;
  mode: "pick" | "manage" | "browse";
  checked?: boolean;
  onToggle?: (next: boolean) => void;
  onInfo: () => void;
  onRemove?: () => void;
  labels: SkillRowLabels;
}): JSX.Element;

// components/AiHelp.tsx  — C.4
export function AiHelp({ screen, context, docked, onApplyPatch, labels }: {
  screen: "templates" | "skills" | "create" | "config";
  /** Serialised draft/filters the suggestions and the model both see. */
  context: Record<string, unknown>;
  /** true = render inline in the C.3 gutter; false = floating bubble. */
  docked: boolean;
  /** Applies an action chip's typed patch to the caller's draft. */
  onApplyPatch: (patch: Record<string, unknown>) => void;
  labels: AiHelpLabels;
}): JSX.Element;

// components/Sparkline.tsx  — F.3
export function Sparkline({ points, width = 220, height = 32, stroke, ariaLabel, table }: {
  points: (number | null)[];          // null = gap, rendered as a break, not a zero
  width?: number; height?: number;
  stroke?: string;                    // defaults to c.accent
  ariaLabel: string;
  /** Visually-hidden <table> rows so the series is readable, not just visible. */
  table: { label: string; value: string }[];
}): JSX.Element;

// components/BarSeries.tsx  — F.4 daily spend
export function BarSeries({ bars, height = 64, onSelect, selectedIndex, ariaLabel, labels }: {
  bars: { key: string; value: number; label: string; valueLabel: string }[];
  height?: number;
  onSelect?: (i: number) => void;
  selectedIndex?: number;
  ariaLabel: string;
  labels: { of: string };
}): JSX.Element;
// role="img" with a description; ←/→ move a cursor and announce the bar via aria-live.

// components/StepTrace.tsx  — F.2
export function StepTrace({ steps, running, expandedIds, onToggle, onExpandAll,
  onCollapseAll, onOpenSkill, labels }: {
  steps: RunStepDTO[];
  running: boolean;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onExpandAll: () => void; onCollapseAll: () => void;
  onOpenSkill: (ref: NonNullable<RunStepDTO["skillRef"]>) => void;
  labels: StepTraceLabels;
}): JSX.Element;

// components/DurationRibbon.tsx  — the bar above StepTrace
export function DurationRibbon({ steps, totalMs, onHover, onSelect }: {
  steps: Pick<RunStepDTO, "id" | "kind" | "durationMs" | "status">[];
  totalMs: number;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
}): JSX.Element;

// components/TimelineRow.tsx  — F.1
export function TimelineRow({ item, onOpen, labels, locale }: {
  item: TimelineItemDTO;
  onOpen?: (runId: string) => void;
  labels: TimelineLabels;
  locale: string;                     // BCP47, for the time formatter
}): JSX.Element;

// components/LoadMore.tsx  — keyset pagination footer
export function LoadMore({ cursor, loading, onLoad, label, loadingLabel, endLabel }: {
  cursor: string | null; loading: boolean; onLoad: () => void;
  label: string; loadingLabel: string; endLabel: string;
}): JSX.Element;
```

## G.4 What deliberately is **not** a component

- **Cards.** `TemplateCard` and `SkillCard` stay local to their page. They are one-use layouts over
  shared primitives; abstracting them would produce a 20-prop component with a `variant` union.
- **A generic `<Table>`.** The two list views have different columns, different sort keys and
  different row bodies. Two ~90-line local components beat one configurable table.
- **A toast system.** Every success and failure in v2 has a home: the DirtyBar, the section card,
  or the field. Nothing needs to float over the page and disappear before it is read.

---

# H. RESPONSIVE RULES

## H.1 New `--r-*` tokens for `app/globals.css`

Added to the `:root` block at `globals.css:509`, and typed into `r` in `lib/theme.ts`.

```css
:root {
  /* --- v2 grids --- */
  --r-gallery: repeat(auto-fill, minmax(320px, 1fr));  /* B.1, D.1 card galleries */
  --r-config: 200px 1fr;                                /* E.1 rail + editor      */
  --r-activity: 1fr 520px;                              /* F.2 timeline + run pane */
  --r-review: 1fr 300px;                                /* C.3 sections + gutter   */
  --r-tpl-cols: minmax(0,1fr) 120px 116px 72px 84px 68px 84px 88px 40px;   /* B.4 */
  --r-skill-cols: minmax(0,1fr) 130px 150px 84px 110px 96px 40px;          /* D.2 */

  /* --- v2 widths / heights --- */
  --r-drawer-w: min(640px, 100vw);
  --r-drawer-w-wide: min(720px, 100vw);
  --r-review-w: 860px;          /* C.3 content column max-width */
  --r-describe-w: 720px;        /* C.1 content column max-width */
  --r-card-px: 18px;            /* gallery card padding */
  --r-savebar-h: 60px;          /* E.1 sticky bar; also the page's bottom padding */
  --r-aihelp-w: 320px;

  /* --- v2 rhythm --- */
  --r-gap-xs: 10px;
  --r-row-h: 56px;              /* list rows, skill rows */
  --r-row-h-sm: 40px;           /* activity rows, step rows */
}
```

Add to `lib/theme.ts`:

```ts
export const r = {
  // …existing…
  gallery: "var(--r-gallery)",
  config: "var(--r-config)",
  activity: "var(--r-activity)",
  review: "var(--r-review)",
  tplCols: "var(--r-tpl-cols)",
  skillCols: "var(--r-skill-cols)",
  drawerW: "var(--r-drawer-w)",
  drawerWWide: "var(--r-drawer-w-wide)",
  reviewW: "var(--r-review-w)",
  describeW: "var(--r-describe-w)",
  cardPx: "var(--r-card-px)",
  savebarH: "var(--r-savebar-h)",
  aihelpW: "var(--r-aihelp-w)",
  gapXs: "var(--r-gap-xs)",
  rowH: "var(--r-row-h)",
  rowHSm: "var(--r-row-h-sm)",
} as const;
```

## H.2 A fourth breakpoint

Today there are three tiers: `:root` (desktop), `≤1024px` (tablet), `≤640px` (mobile). C.3's
gutter and F.2's side pane need a **wide** tier. The existing layer's rule is *"`:root` mirrors the
widest layout; `@media (max-width: …)` blocks override only what must change, narrower last"* —
so the wide values go in `:root` and a `max-width: 1279px` block steps them down. **Insert it
above the 1024px block** so the cascade order stays widest → narrowest.

```css
/* ---- Laptop (1025–1279px): the side gutters do not fit ---- */
@media (max-width: 1279px) {
  :root {
    --r-review: 1fr;          /* C.3 gutter collapses; validation moves inline */
    --r-activity: 1fr;        /* F.2 run detail becomes a push view            */
  }
}
/* AiHelp docking is a JS decision keyed on the same 1279px query, not a token —
   `--r-aihelp-w` does not change here, so re-declaring it would be a no-op that
   reads like a rule. The component takes `docked` from a matchMedia hook. */

/* ---- Tablet (641–1024px) ---- */
@media (max-width: 1024px) {
  :root {
    /* …existing… */
    --r-gallery: repeat(auto-fill, minmax(280px, 1fr));
    --r-config: 1fr;                       /* E.1 rail becomes a chip row */
    /* Drop AGENTS, SCHED and UPDATED — 9 tracks become 6, and the 6 that remain
       keep their desktop widths. The draft of this line listed 5 tracks against a
       6-column header, which silently dropped CATEGORY too and mis-sized USED BY. */
    --r-tpl-cols: minmax(0,1fr) 120px 116px 72px 84px 40px;
    --r-skill-cols: minmax(0,1fr) 150px 84px 96px 40px;    /* drop PUBLISHER/RUNS ON    */
    --r-review-w: 100%;
    --r-drawer-w: min(560px, 100vw);
    --r-drawer-w-wide: min(640px, 100vw);
  }
}

/* ---- Mobile (≤640px) ---- */
@media (max-width: 640px) {
  :root {
    /* …existing… */
    --r-gallery: 1fr;
    --r-tpl-cols: 1fr;        /* list view is not offered; see H.3 */
    --r-skill-cols: 1fr;
    --r-drawer-w: 100vw;
    --r-drawer-w-wide: 100vw;
    --r-card-px: 14px;
    --r-savebar-h: 68px;      /* two-line summary + 44px targets */
    --r-aihelp-w: calc(100vw - 32px);
    --r-row-h: 64px;          /* touch */
    --r-row-h-sm: 48px;
    --r-describe-w: 100%;
  }
}
```

## H.3 Per-screen behaviour

| screen | ≥1280 | 1025–1279 | 641–1024 | ≤640 |
|---|---|---|---|---|
| **B. Templates** | 3-up gallery; drawer 720 | 3-up; drawer 720 | 2-up (280 min); drawer 640; list drops 3 cols | 1-up; **grid only** — the toggle is hidden and `view` forces `grid`; drawer is a full-screen sheet with a `‹ Back` header |
| **C.1 Describe** | 720 centred | 720 | 720 | full width; seed chips stack 1-up; `Draft my agent` becomes a sticky bottom button |
| **C.2 Generating** | 720 | 720 | 720 | full width; detail lines wrap to 2 |
| **C.3 Review** | 860 + 300 gutter | 860, gutter inline above the sections | full width | full width; section cards lose the metric strip; AiHelp is the floating bubble |
| **D. Skills** | as B | as B | as B | as B |
| **E. Config** | 200 rail + editor | same | rail → horizontal chip row, `overflow-x:auto`, sticky under the tabs | same as tablet; DirtyBar is two lines |
| **F.1 Timeline** | full width | full width | meta column drops cost | time column → `HH:mm`; meta moves to a second line under the body |
| **F.2 Run** | side pane 520 | push view | push view | push view, full screen |
| **F.3 Health** | 4-up | 4-up | 2-up (`--r-col-4`) | 1-up; state strip scrolls horizontally inside `.ark-scroll` |
| **F.4 Cost** | 3-up + tables | 3-up | 2-up | 1-up; BY TRIGGER share bars drop, values stay |

**The list-view rule below 640px is deliberate.** A 9-column table on a 375px screen is either an
unreadable horizontal scroll or a card in disguise. The toggle is hidden (not disabled), and the
persisted `list` preference is respected again as soon as the viewport is wide enough — so the
preference is never destroyed, only overridden.

## H.4 Two new global class names (a third, `.sr-only`, is in I.3)

Inline styles cannot express `:hover` on a non-`Btn` element, `::-webkit` internals, or a
`@media` query, so these two go in `globals.css` beside the existing four.

```css
/* Horizontal scroller that keeps its scrollbar out of the layout — the E.1
   section rail on tablet, the F.3 state strip on mobile, the D/B filter row.
   `overflow-y: visible` is NOT available here (a scroll container clamps the
   cross axis to auto), so the 2px focus ring of a child would be clipped at the
   top and bottom edges. The padding is the fix, not a nicety: it reserves the
   ring's 4px so I.1's outline survives inside a scroller. */
.ark-hscroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding-block: 4px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.ark-hscroll::-webkit-scrollbar { display: none; }

/* Clamp a card's description to N lines without measuring. Set --lines inline. */
.ark-clamp {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--lines, 2);
  overflow: hidden;
}
```

`.ark-clamp` is what keeps the B.3 and D.1 cards a fixed height without JS. `--lines` is set from
the inline style object, so it stays inside the token idiom.

---

# I. ACCESSIBILITY

## I.1 Focus — fix the existing rule before adding screens

`app/globals.css:705-708`:

```css
:where(a, button, [role="menuitem"], [role="menuitemradio"], [role="radio"], input, select, textarea):focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}
```

Three problems for v2:

1. **The selector list is short.** v2 adds `summary` (every `<details>` in B.5, C.3, D.3, F.2),
   `[role="switch"]` (Toggle), `[role="option"]`, `[role="checkbox"]`, `[role="tab"]`,
   `[role="slider"]` and roving-tabindex rows (`[tabindex]`). All of them are currently unstyled on
   focus and inherit whatever the UA does — which on a tinted panel can be nothing.
2. **The ring's contrast depends on what is behind the element.** With `outline-offset: 2px` the
   ring is painted on the *parent* surface, so its contrast is a function of where the control
   happens to sit. On a `c.limeWash` card in terminal-dark, `c.accent` on `c.limeWash` is 14.44:1
   — fine; but the rule is accidental, not designed.
3. **A focused control inside a filled parent has no separation.**

**Replacement:**

```css
:where(
  a[href], button, summary, input, select, textarea, [tabindex]:not([tabindex="-1"]),
  [role="button"], [role="link"], [role="menuitem"], [role="menuitemradio"],
  [role="menuitemcheckbox"], [role="radio"], [role="checkbox"], [role="switch"],
  [role="tab"], [role="option"], [role="slider"]
):focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}
```

**Two things dropped from the draft of this rule, and why.**

*`box-shadow: 0 0 0 2px var(--c-bg)` does not do what it claims.* With `outline-offset: 2px` the
outline occupies the band 2–4px outside the border box; a 2px spread shadow occupies 0–2px. It
therefore fills the *inner* gap and leaves the ring's outer edge sitting on whatever the parent
paints — so the stated guarantee ("contrast is always measured against `--c-bg`") holds on one side
only. A 6px spread would enclose both edges, but it is a heavy halo, and it is unnecessary:
`--c-accent` clears 3:1 against every surface it can land on. Worst case per palette, over
`bg`/`panel`/`panel-deep`/`hover` **and** `lime-wash`/`lime-wash2`: terminal-dark 11.61,
terminal-light 4.57, ivory-dark 4.96, ivory-light 4.57, midnight-dark 4.65, midnight-light 4.59 —
every one above the 3:1 floor with margin, and above 4.5:1 as it happens. A bare outline is
sufficient and does not fight the component's own shadows.

*`border-radius: inherit` is a bug.* It changes the element's own geometry, and it takes the
**parent's** radius, not the element's. On any focusable element that does not set its own radius —
a bare `<a>`, a `<summary>`, an unstyled button — the shape would visibly jump on focus. It also
does nothing useful: `outline` already follows the element's border radius in every current engine.

**Proof of the ring (WCAG 2.4.11 / 1.4.11 need 3:1):** `--c-accent` against `--c-bg` —
terminal-dark **16.95**, terminal-light **5.16**, ivory-dark **6.10**, ivory-light **5.15**,
midnight-dark **6.04**, midnight-light **5.32**. All pass with margin, as do the tinted surfaces
listed above.

**The ring is only as good as its clipping context.** `overflow: hidden` on an ancestor crops a
`2px`-offset outline. The two places v2 creates that risk are `.ark-hscroll` (H.4 — solved with
`padding-block: 4px`) and `.ark-clamp` (which is `overflow: hidden` by construction, so nothing
inside a clamped description may be focusable — keep links out of card summaries).

`:where()` keeps specificity at 0, so any component can still override — but nothing in v2 should.

## I.2 Keyboard paths, screen by screen

| screen | contract |
|---|---|
| **B / D gallery** | Tab reaches: search → each filter trigger → view toggle → each card. A card is a single tab stop; `Enter` opens the drawer; `Tab` inside the card reaches its two buttons. Grid arrow-key navigation is **not** implemented — cards are links, and browsers already handle link lists. |
| **B / D list** | Column headers are `<button>`s inside `<th>`; `Enter`/`Space` sorts, `aria-sort` announces. Rows are one tab stop each. |
| **B.5 / D.3 drawer** | Focus moves to the close button on open. `Tab` cycles inside (focus trap). `Escape` closes and returns focus to the invoking card/row. The page behind gets `inert`. |
| **C.1 Describe** | Seed chips are buttons in the tab order; activating one fills the textarea and moves focus into it at the end of the text, so a keyboard user can immediately edit. `Ctrl/Cmd+Enter` in the textarea submits. |
| **C.2 Generating** | `Cancel` is the only control and is focused on mount. The stage list is `role="list"` + `aria-busy="true"`; the active stage's label + detail sit in one `aria-live="polite"` region so a screen reader hears "Choosing skills. Matching 7 candidates…" once per transition, not eight times. |
| **C.3 Review** | Sections are in DOM order. A skip link — *"Skip to Continue"* — is the first focusable element. Every `✎ Edit` moves focus to the first field of the section it opens. |
| **C.3.2 RuleList** | Row focused → `↑`/`↓` reorders, `Delete` removes (with an undo announcement), `Enter` edits. The pointer drag handle is `aria-hidden`; the keyboard path is the real one. |
| **C.3.3 Context** | The drop zone is a `<label>` wrapping a visually-hidden `<input type="file" multiple>` — so `Tab` + `Enter` opens the native picker with zero custom code. `✎ Paste` moves focus to the title input. |
| **C.3.4 Schedule** | `When` is a `radiogroup`: `←`/`→` move and select. Day chips are a second `radiogroup`-like set using `role="checkbox"` (multi-select) with roving tabindex. `CronPreview` is not focusable; it is `aria-live="polite"` so a change to the cron announces the new next-run. |
| **C.4 AiHelp** | The bubble is a button with `aria-expanded`. Expanded: focus moves to the composer. `Escape` collapses and returns focus to the bubble. Action chips are ordinary buttons; applying one announces "Added web-research" in the panel's live region. |
| **E.1 Config** | The rail is `<nav>` with anchor links — no custom key handling. `Ctrl/Cmd+S` saves when the form is dirty and valid (and is a no-op otherwise, never a silent failure). The DirtyBar is placed **after** the editor in the DOM so `Tab` from the last field reaches Discard → Save. |
| **E.3 guard** | The unsaved-changes `ConfirmDialog` is `role="alertdialog"`, initial focus on *Keep editing* (the safe choice), `Escape` = Keep editing. |
| **F.1 Timeline** | Rows are one tab stop; `Enter` opens the run. `⟳ Live` is a `role="switch"`. New rows arriving while a row is focused must not steal focus or shift it — they are inserted above and the scroll position is anchored. |
| **F.2 StepTrace** | Native `<details>`/`<summary>`, so `Enter`/`Space` toggles and `aria-expanded` is free. `Expand all` / `Collapse all` are buttons; the ribbon is decorative (`aria-hidden`) because every segment it shows is also a step row. |
| **F.4 BarSeries** | `role="img"` with an `aria-label` summarising the range; when `onSelect` is supplied it becomes `role="application"`-free roving focus: `←`/`→` move a cursor, `Home`/`End` jump, and the selected bar's label+value go to `aria-live="polite"`. |

## I.3 ARIA for the new interactive components

| component | roles & attributes |
|---|---|
| `ViewToggle` | `role="radiogroup"` + `aria-label`; children `role="radio"` `aria-checked`; roving `tabindex` |
| `FilterSelect` | trigger `aria-haspopup="menu"` `aria-expanded` `aria-controls`; menu `role="menu"`; rows `role="menuitemcheckbox"` (multi) or `role="menuitemradio"` (single) with `aria-checked`. Inherits `MenuPopover`'s existing Home/End/Escape contract |
| `SearchField` | `type="search"` `role="searchbox"` implied; `aria-label` from the dictionary; clear button `aria-label` |
| `Drawer` | `role="dialog"` `aria-modal="true"` `aria-labelledby` (title) `aria-describedby` (subtitle); `inert` on the app root while open |
| `ConfirmDialog` | `role="alertdialog"` `aria-modal="true"` `aria-labelledby` `aria-describedby` |
| `Toggle` | `role="switch"` `aria-checked` **(replaces today's `aria-pressed`, `:1516`)**; label associated via `id`/`aria-labelledby`; `desc` via `aria-describedby` |
| `Seg` | `role="radiogroup"` `aria-label`; options `role="radio"` `aria-checked`; `←`/`→`/`Home`/`End` |
| `RiskPill` | not focusable; `<span>` with the level word in text — the glyph and colour are redundant encodings, never the only one |
| `HarnessMatrix` | wrapper `role="img"` with an `aria-label` that distinguishes all **three** states in words — "Runs on OpenClaw and Hermes. Not supported on Codex Harness. Unverified on DeepSeek Harness." A label that lists only the supported set silently reports `unknown` as `no` |
| `StageList` | `role="list"`, `aria-busy` while running; one `aria-live="polite"` `aria-atomic="true"` region for the active stage |
| `DirtyBar` | `role="region"` `aria-label="Unsaved changes"`; the count in `aria-live="polite"`; hidden state removes it from the DOM (not `visibility`) so it leaves the tab order |
| `SectionRail` | `<nav aria-label>`; the current link `aria-current="true"`; per-section state announced in the link text ("Skills, 2 edited"), not by colour alone |
| `RuleList` | `<ul>`/`<li>`; each row `aria-label` "Rule 3 of 5, NEVER"; one `aria-live="polite"` region for reorder/remove announcements |
| `ContextItems` | `<ul>`; each row's status in text; upload progress `role="progressbar"` `aria-valuenow/min/max`; extraction is `aria-busy` |
| `ScheduleEditor` | fieldset/legend per group; `CronPreview` `aria-live="polite"` |
| `SkillRow` | `role="checkbox"` when `mode="pick"`; `aria-describedby` pointing at the risk line so the level is announced with the name |
| `Sparkline` | `<svg role="img">` + `<title>` + a `.sr-only` `<table>` of the same values |
| `BarSeries` | `role="img"` + `aria-label`; per-bar `aria-live` on selection |
| `StepTrace` | `<ol>`; each step `<details>`; `phase` and `status` in the accessible name ("Step 4, tool call, http, error") |
| `LoadMore` | `aria-live="polite"` announcing "50 more loaded, 312 shown" |

A `.sr-only` utility does not exist yet. Add it to `globals.css` beside `.ark-hscroll`:

```css
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0;
}
```

## I.4 Never colour-only

Every state in v2 carries a **second** encoding:

| state | colour | second encoding |
|---|---|---|
| risk low / medium / high | green / amber / red | glyph `●` `◐` `▲` **and** the word |
| run succeeded / failed / running | green / red / accent | `✓` `✕` `◐` **and** the word |
| step ok / error | — / red | `✕` glyph **and** a left border **and** the error text |
| harness compatible | green / faint | `✓` / `✕` **and** the `.sr-only` sentence |
| dirty field | amber left border | `↺` revert button appears **and** the section rail count |
| health state strip | green / amber / grey | block glyph height differs per state **and** a legend |
| trigger type | five hues | five distinct glyphs **and** the filter label |

## I.5 Reduced motion

`prefers-reduced-motion: reduce` must disable, not merely shorten:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  html { scroll-behavior: auto !important; }
}
```

(0.01ms rather than `none` is deliberate: it lets `animationend` still fire, so a component that
sequences on that event does not hang. `scroll-behavior` is scoped to `html` — it is a property of
the scroll container, and `*` would also apply it to every non-scrolling element for nothing.)

Component-level consequences, which the blanket rule does **not** cover and each component must
handle itself:

- **C.2** — the `pulse` on the active stage becomes a static `◐` in `c.accent`. The stage list
  still updates; only the animation stops.
- **F.1 live mode** — `riseIn` on new rows is skipped; rows appear instantly.
- **E.1 DirtyBar** — the slide-up becomes an instant appearance.
- **E.1 rail jump / C.3 section jump** — `scrollIntoView({ behavior: "auto" })`.
- **F.2 duration ribbon** — the growing segment on a running run stops animating and re-renders on
  each step event instead.
- **Drawer / ConfirmDialog** — no slide, no fade; they appear and disappear.

The existing `blink`, `pulse`, `spin`, `riseIn`, `fadeIn` keyframes (`globals.css:834-879`) are all
covered by the blanket rule once it is added — **it is not there today.**

## I.6 Touch targets

`globals.css:625-627` floors `button { min-height: 44px }` below 640px. v2 adds non-`button`
interactive elements — `summary`, drag handles, the day chips, list rows — so extend it:

```css
@media (max-width: 640px) {
  button, summary, [role="button"], [role="switch"], [role="radio"],
  [role="checkbox"], [role="tab"], [role="menuitem"], [role="menuitemradio"],
  [role="menuitemcheckbox"] {
    min-height: 44px;
  }
}
```

`--r-row-h: 64px` and `--r-row-h-sm: 48px` on mobile (H.2) keep list and step rows above the floor
without a per-component rule.

## I.7 The contrast proof, restated as an acceptance test

Section A's tables are the specification. Turn them into a test so they cannot regress:

`lib/theme.contrast.test.ts` — parse `app/globals.css`, extract all six palette blocks, and assert
for each:

| assertion | threshold |
|---|---|
| `text`, `text2`, `muted` vs each of `bg`, `panel`, `panel-deep`, `hover` | **≥ 7.0** |
| `faint` vs the same four | **≥ 4.5** |
| `accent`, `green`, `amber`, `red`, `blue`, `orange` vs the same four | **≥ 4.5** |
| `accent` vs `lime-wash` and `lime-wash2` | **≥ 4.5** |
| `green` vs `green-wash`; `red` vs `red-wash` | **≥ 4.5** |
| `green-ink` vs `green`; `ink` vs `lime` | **≥ 4.5** |
| `border-field` vs `bg`, `panel`, `panel-deep`, `hover` | **≥ 3.0** |
| `accent` vs `bg` (the focus ring) | **≥ 3.0** |
| every block **including `:root`** declares the same token-name set | equality |
| `html[lang="ja-JP"]` and `html[lang="zh-TW"]` resolve `--w-body` to `400` | equality |
| `ThemeBoot` writes `document.documentElement.lang` | present |

The token-name-set assertion is the one that catches the class of bug in A.5: those three values
were wrong because a block was copied and one line was not re-derived. It must include `:root`,
which is the universal fallback and the block most likely to be forgotten when a token is added
(`--c-border-field` is exactly that case).

That is **51 ratio assertions per palette, 306 in all** — 12 for `text`/`text2`/`muted`, 4 for
`faint`, 24 for the six status colours, 2 for `accent` on the lime washes, 2 for `green`/`red` on
their washes, 2 for the two inks, **4** for `border-field` (the fourth being `hover`, which the
draft of this test omitted and which terminal-dark failed at 2.99), and 1 for the focus ring.
Every one passes against the values in A.3.

Against `main` today **82 of the 282 evaluable assertions fail** — the other 24 are the
`border-field` ones, which cannot be evaluated because the token does not exist yet. Counting those
as failures, which is what the test will actually print on its first run, gives **106 of 306**:
nearly exactly a third of the product's colour pairings. Per palette, evaluable failures today:
terminal-dark 2, terminal-light 19, ivory-dark 9, ivory-light 22, midnight-dark 10,
midnight-light 20. The two worst palettes are the two light ones, which is the opposite of the
usual assumption and is why the ramp was never caught: the product is developed in terminal-dark,
where it is nearly clean.

---

# J. LOCALISATION

Five new per-screen dictionaries, each a `Record<Lang, XDict>` with all four languages written
natively, following `lib/i18n/fleet-detail.ts`:

| file | screens |
|---|---|
| `lib/i18n/templates.ts` | B — gallery, filters, card, list, drawer, four empty states, the "start from" banner, the 11 `TemplateCategory` labels — **and the ten ATG stage labels**, which `docs/AGENT_TEMPLATE_GENERATOR.md` §9.1 already places in this file, not in `atg.ts` |
| `lib/i18n/skills.ts` | D — gallery, facets, the 16 `skill_category` labels, risk vocabulary, the ~20 `riskSignal.code` sentences, requirements, scan panel, all four add-to-agent steps, the eight §6.5 error strings (`docs/SKILL_REPOSITORY.md` §7.7 enumerates these) |
| `lib/i18n/atg.ts` | C — describe screen, the four seed prompts, the three mode banners, section headers, AiHelp suggested prompts and canned answers. **Not** the stage labels |
| `lib/i18n/agent-config.ts` | E — nine section titles, ~60 field labels and hints, all validation messages from E.4, DirtyBar and sync states |
| `lib/i18n/activity.ts` | F — four sub-tab names, trigger/phase/kind/status vocabulary, health labels, cost labels, empty and failure states |
| `lib/i18n/dashboard-layout.ts` | **existing file, two new keys** — `navTemplates` and `navSkills`. Two new top-level pages with no nav entry is the most likely thing to be forgotten in this whole document; see K step 5a |

Three things that must not be hardcoded, because they are the ones most likely to be:

1. **The vocabulary enums.** `trigger`, `phase`, `kind`, `status`, `risk_level`, `difficulty` and
   the 16 category slugs all render as user-visible words. They are `Record<Lang, Record<Enum,
   string>>` maps, never `slug.replace("-", " ")`.
2. **Schedule humanisation.** `"Weekdays at 08:30"` is produced by `lib/schedule/describe(cron, tz,
   lang)`, server-side, so `TemplateSummaryDTO.sampleSchedule` and `AgentConfigDTO.schedules[].human`
   arrive already localised and every surface agrees. Dates and times go through
   `Intl.DateTimeFormat(BCP47[lang], { timeZone })` — the `BCP47` map at `lib/i18n/index.ts:24`
   exists precisely because `lang` is not a locale.
3. **Numbers.** `fmtInt` (`fleet/[id]/page.tsx:878`) hardcodes `toLocaleString("en-US")`. Install
   counts of 476,682 must group per locale. Change it to take the BCP47 tag.
4. **What is *not* translated, and must be labelled as such.** Skill `name` / `summary` /
   `description` are upstream text in the publisher's language (`docs/SKILL_REPOSITORY.md` §7.7),
   and a template's strings are written in its own `agent_templates.locale`. Neither is machine-
   translated; both are rendered as-is with the locale shown. Harness names are product names and
   stay untranslated in all four dictionaries.

`documentElement.lang` must track the UI language (A.6.4) — required by the CJK weight rule, and
correct for assistive technology regardless.

---

# K. IMPLEMENTATION ORDER

Ordered so that each step is independently shippable and nothing is blocked on the backend.

| # | work | depends on | ships value alone? |
|---|---|---|---|
| 0 | **The `engine` enum extension, in its own migration file.** `ALTER TYPE "engine" ADD VALUE IF NOT EXISTS 'codex'` / `'deepseek'`. Postgres refuses to *use* an enum value in the transaction that added it, and `drizzle-kit migrate` wraps each file in one — so these two statements must ship **alone**, ahead of the migration that creates `agent_skills.harness` (`docs/SKILL_REPOSITORY.md` §1.1). This is the single most likely way the whole v2 migration fails in CI. | nothing | no — but everything with four harnesses is blocked on it |
| 1 | **A.3 palette values + `--c-border-field` (six blocks **and** `:root`) + `c.borderField` in `lib/theme.ts` + A.5 three bug fixes + I.7 contrast test** | nothing | yes — every screen gets readable immediately |
| 2 | **A.6 `w` tokens + `documentElement.lang` + Newsreader roman** | 1 | yes |
| 3 | **A.6.5 migration rules 1–3** (mechanical) | 2 | yes |
| 4 | **G.1 promote the six primitives out of the fleet page** | nothing | no, but unblocks 5–9 |
| 5 | **G.2 new primitives** (Drawer, ConfirmDialog, FilterSelect, ViewToggle, EmptyState, RiskPill, HarnessPill/Matrix, MetricStrip) | 4 | no |
| 5a | **Nav entries + dictionary keys** for `/dashboard/templates` and `/dashboard/skills` in `app/dashboard/layout.tsx:17` (`navDefs`) and `lib/i18n/dashboard-layout.ts`. `docs/SKILL_REPOSITORY.md` §7 fixes the skills row: `{ id: "skills", key: "navSkills", icon: "◈", href: "/dashboard/skills" }`, placed after `agents`. | 4 | yes — two finished pages nobody can reach is the failure mode |
| 6 | **D. Skill Repository** — read-only browse first, add-to-agent second | 5 + `skills` seeded | yes |
| 7 | **B. Template page** | 5 + `agent_templates` seeded | yes |
| 8 | **E. Agent configuration** — E.3 dirty state and E.5 sync honesty **before** the new sections | 5, 6 | yes; E.5 alone fixes a live data-integrity lie |
| 9 | **C. AI-guided creation** — the deterministic path first, the LLM path second | 5, 7, `lib/atg` | yes; the rule-based draft is a complete product |
| 10 | **F.4 COST** via the §3.2 interim win (persist `responseId` + usage) | nothing upstream | yes |
| 11 | **F.1/F.2 TIMELINE + RUNS** | webhook registration (§3.7) or the pull endpoints (§3.2) | **no — blocked upstream** |
| 12 | **F.3 HEALTH** | `agent.health` (§3.6) | **no — blocked upstream** |

Steps 1–3 are one PR and answer the product owner's stated complaint in full. Do them first.

---

# RISKS

**R1 — The Activity page has no data source, and the product owner has ranked it highly.**
`docs/research/RUNTIME_INTEGRATION.md` §2.3: nothing upstream sends any webhook; §3.2 and §3.6 are
both PROPOSED. F.1, F.2 and F.3 are designed against event shapes **the backend team has not agreed
to build.** If they do not land, the Activity tab in v2 shows ArkAgent's own bookkeeping rows and
nothing else — visibly worse than the wireframes here. Mitigation: ship step 10 (F.4 COST, plus
`chat`-triggered runs) which needs no upstream change, and gate F.1's other trigger types behind a
capability flag rather than rendering an empty timeline that implies the agent did nothing.

**R2 — The `--c-muted` lift changes how the app looks, and someone will call it a regression.**
Ivory-light `--c-muted` moves 4.13 → 7.11 against the page. That is a large, deliberate, visible
change to the product's most-used secondary colour. It is the fix the product owner asked for, but
it should be shown to them side by side before merge, not discovered in staging.

**R3 — The CJK weight override depends on a change outside the CSS.** `--w-body: 440` is wrong for
`zh`/`zht`/`ja` unless `documentElement.lang` tracks the UI language. If the store change in A.6.4
is dropped from the PR, every Chinese and Japanese screen silently renders at Medium 500. The two
changes must land together, and the contrast test should be joined by an assertion that
`ThemeBoot` writes `lang`.

**R4 — Harness compatibility is asserted, and OWASP AST10 names exactly that as the risk.**
`docs/research/SKILL_ECOSYSTEM.md` §D2: *Cross-Platform Reuse* is on the Agentic Skills Top 10, and
our value proposition is cross-harness reuse. `HarnessMatrix` renders three states (`yes`/`no`/
`unknown`) rather than two on purpose — but the moment `unknown` is rendered as a green tick to
make a card look tidier, we have shipped the AST10 failure mode. This is a code-review rule, not a
design one, and it will be violated unless someone owns it.

**R5 — Four new pages, ~60 new components' worth of strings, four languages.** `lib/i18n` grows by
roughly 5× the size of `fleet-detail.ts`. Nothing enforces that all four languages are complete —
the dictionaries are plain objects, and a missing `ja` key is a TypeScript error only if the
interface is exhaustive and the author did not use a spread. Add a lint step that asserts each
dictionary's four language objects have identical key sets before the volume makes it unfixable.

**R6 — `--r-gallery` uses `auto-fill`, which the existing `r` tokens never do.** Every other grid
token is a fixed track count that the breakpoints override. `auto-fill` reflows independently of
the breakpoints, so a card grid inside a container narrower than the viewport (the C.3 gutter, a
drawer) can produce a column count the media queries did not anticipate. Only use `r.gallery` on
full-width page content, never inside a drawer or a pane.

**R7 — The schedule editor's cron maths is ours, and a second copy of it is the real hazard.** The
no-new-dependencies constraint means `lib/schedule/cron.ts` owns 5-field cron parsing,
timezone-aware next-run computation and DST handling — and
`docs/BACKEND_INTEGRATION_CONTRACT.md` §2.7 additionally names it as the definition the *runtime
team may port*. Three implementations (ours server-side, ours client-side in `CronPreview`, theirs)
that disagree by one hour produce silently-wrong fire times that nobody can reproduce. One module,
imported by both the route and the component, and shipped to them as source.
`CronPreview` makes the output visible, which is good — it also makes every DST bug visible to the
user on the day it happens. The preview must be computed with `Intl.DateTimeFormat` + a real
timezone walk, not by adding milliseconds to a UTC instant, or the five dates shown across a DST
boundary will be wrong by an hour and the user will trust them.

**R8a — This document is downstream of four others and drifted from all four.** §B contradicted
`docs/AGENT_TEMPLATE_GENERATOR.md` §7.1/§9.4 on the `agent_templates` column set and on
`TemplateSummaryDTO`; §C contradicted its §2/§9.1 on the stage list and the SSE frame shape; §D
contradicted `docs/SKILL_REPOSITORY.md` §7 on six UI decisions and on the add-to-agent flow; §E and
§F contradicted `docs/BACKEND_INTEGRATION_CONTRACT.md` §2.6/§2.7/§3.2 on five enum vocabularies and
on the cost unit. All are corrected above, but the drift is structural, not a one-off: five
documents describe one system and nothing checks them against each other. **Mitigation:** the enums
and DTOs in §B.10, §E.6 and §F.5 must be generated from, or type-checked against,
`lib/db/schema.ts` — a `satisfies` assertion per enum in `lib/serializers.ts` costs ten lines and
turns every one of these into a compile error. Until that exists, treat the contract docs as
normative and this one as the rendering of them.

**R8b — Two card cells and one health card have no data source, and the fix is a migration or a
deletion, not a decision to defer.** `agent_templates` has no `difficulty` and no
`time_to_value_minutes` (B.3); `agent_health_samples` has no `disk_limit_bytes` (F.5). Each was
drawn in a wireframe before anyone checked. Ship the reduced card, or land the columns in the same
migration as the table — but do not leave a wireframe promising a number that cannot be computed,
because what gets built from it is a fabricated one.

**R9 — A design constant I think is wrong, used anyway as instructed.** `engineEnum` extends to
`"codex"` and `"deepseek"` with display labels *"Codex Harness"* and *"DeepSeek Harness"* while
OpenClaw and Hermes carry no suffix. Four sibling values in one `Seg` where two are suffixed reads
as a taxonomy error to the user, and it makes every list column 8 characters wider than it needs to
be. I have used the given labels everywhere in this document. Recommendation: display them as
*OpenClaw · Hermes · Codex · DeepSeek* and keep "Harness" out of the label.
