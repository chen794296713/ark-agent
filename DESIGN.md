---
name: ArkAgent Team Directory
description: Illustrated AI coworkers on a near-white canvas with forest lettering and leaf-green portrait fields.
colors:
  forest: "#15362d"
  forest-hover: "#2a5142"
  forest-active: "#0c251e"
  ground: "#fefefd"
  leaf: "#c6d897"
  muted: "#446052"
  on-forest: "#f8f8f8"
  paper: "#ffffff"
  divider: "#c2ccc0"
  profile-divider: "#d6dfd7"
  hiring-muted: "#536456"
  hiring-line: "#d9dfd9"
  field-border: "#829084"
  selection-wash: "#eef3e4"
  selection-border: "#6c825f"
  hiring-hover: "#264d3d"
  option-hover: "#f0f3eb"
  error: "#8e322f"
  error-wash: "#fcf0ed"
  error-border: "#b58179"
typography:
  display:
    fontFamily: "Geom, sans-serif"
    fontSize: "clamp(56px, 5.40365vw, 90px)"
    fontWeight: 750
    lineHeight: 0.92
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geom, sans-serif"
    fontSize: "clamp(32px, 3.15vw, 48px)"
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geom, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Instrument Sans, sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontFamily: "Instrument Sans, sans-serif"
    fontSize: "14px"
  annotation:
    fontFamily: "Caveat, cursive"
    fontSize: "36px"
    fontWeight: 600
    lineHeight: 0.95
rounded:
  select: "4px"
  field: "7px"
  option: "8px"
  badge: "20px"
  action: "100px"
spacing:
  tight: "8px"
  small: "12px"
  item: "16px"
  group: "24px"
  block: "32px"
  wide: "48px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.on-forest}"
    rounded: "{rounded.action}"
    padding: "12px 39px"
  button-primary-hover:
    backgroundColor: "{colors.forest-hover}"
  button-primary-active:
    backgroundColor: "{colors.forest-active}"
  button-hire:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.paper}"
    rounded: "{rounded.action}"
    padding: "12px 26px"
  button-secondary:
    textColor: "{colors.forest}"
    rounded: "{rounded.action}"
    padding: "9px 17px"
  button-back:
    textColor: "{colors.hiring-muted}"
    rounded: "{rounded.action}"
    padding: "10px 4px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.forest}"
    rounded: "{rounded.field}"
    padding: "13px 15px"
  role-option:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.forest}"
    rounded: "{rounded.option}"
    padding: "19px 20px"
  recommended:
    backgroundColor: "#dce8c3"
    textColor: "{colors.forest}"
    rounded: "{rounded.badge}"
    padding: "4px 10px"
  navigation:
    textColor: "{colors.forest}"
  sample-sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.forest}"
    padding: "28px"
---

# Design System: ArkAgent Team Directory

## Overview

**Creative North Star: "Illustrated Team Directory"**

Painted fictional coworkers give each AI role a recognizable face. Near-white space, forest lettering, leaf-green image fields, and substantial rounded type make the experience approachable while keeping responsibilities and controls readable. The approved reference is `.impeccable/mocks/decision/team-directory.png`; the surface composition contract remains in `.impeccable/surfaces/app-page-tsx.md`.

This system covers the landing page, public agent profiles, and hiring flow only. It is extracted from `components/marketing/*.module.css`, their TSX components, `app/hire/hire.module.css`, and font declarations in `app/layout.tsx`. The dashboard, authentication, and other existing surfaces retain the separate themes in `app/globals.css`; these tokens do not replace those themes. Marketing and hiring explicitly establish a light local scope.

**Key Characteristics:**

- Original painted portraits with sharp rectangular edges.
- Heavy Geom headings, readable Instrument Sans copy, and a sparing Caveat annotation.
- Rounded primary actions, flat content, fine dividers, and visible native controls.
- Real links and editable briefs; illustrations and sample work remain identified as such.

## Colors

A restrained green palette leaves the portraits as the richest visual material. Frontmatter records the reusable source values; the names below describe their jobs.

### Primary

- **Forest:** headings, body ink, primary actions, and the marketing footer. Marketing hover and pressed states deepen or lighten this ink; hiring has its own evidenced hover shade.
- **Leaf:** recurring portrait backing, text selection, and the landing process section.

### Neutral

- **Ground:** near-white page background, distinct from white form fields and sample sheets.
- **Muted:** supporting marketing and profile text. Hiring uses its own muted tone within its scoped variables.
- **Divider / Profile divider / Hiring line:** lightweight rules that separate content without enclosing every block.
- **Selection wash / Selection border:** selected radio options and channels. Error colors apply to failure messages, never decoration.

**The Local Palette Rule.** Keep these colors scoped to the team-directory surfaces; the root theme variables belong to the incumbent application themes.

## Typography

**Display Font:** Geom, sans-serif, supplied through `--font-team`.
**Body Font:** Instrument Sans, sans-serif, supplied through `--font-sans`.
**Annotation Font:** Caveat, cursive, supplied through `--font-hand`.

The rounded geometric display face carries recognition; the quieter body face carries explanations and controls. There is no fixed mathematical scale: roles use source-specific responsive sizes.

### Hierarchy

- **Display:** the frontmatter display role is the desktop landing title. At widths up to 900px it becomes `clamp(43px, 7.7vw, 69px)` with line-height 1.
- **Profile title:** `clamp(3rem, 5.25vw, 4.5rem)`, weight 720, line-height .99, tracking -.04em; the text measure is 13ch.
- **Headline:** frontmatter captures marketing section headings. Profile section titles use `clamp(1.75rem, 2.7vw, 2.375rem)`, weight 650, line-height 1.12. Hiring titles use `clamp(34px, 3.6vw, 48px)`, weight 650, line-height 1.08.
- **Title:** Geom anchors role and process titles. Smaller profile cards use 21px; hiring context headings use 23px.
- **Body:** base copy uses the recorded body role; introductions and descriptive blocks expand to 17–20px. Long explanations commonly stop at 55–65ch. Hiring base line-height is 1.55.
- **Label:** sentence-case body typography; fine-print notes use 12–14px. Numeric prices and step numbers use tabular numerals.
- **Annotation:** handwritten explanation accompanies the landing portraits; it is not a navigation or form-label face.

**The Readable Roles Rule.** Use display type for role identity and headings; use the body face for tasks, costs, labels, and boundaries.

## Layout

Marketing uses broad whitespace and aligned text columns. The header and first viewport cap at 1680px. Lower landing sections cap at 1440px and normally use 96px vertical / 60px horizontal padding. Profiles cap at 1200px with an 80px total desktop gutter. Hiring caps its header at 1440px and its content at 1200px, with a 232px step rail and flexible form column. Repeated gaps come from the spacing values above; page composition also uses larger 60–120px separations.

At 1100px the lower landing gutters narrow and role rows lose the separate trailing action. At 900px the marketing navigation becomes a native disclosure, the portrait lineup reflows into two columns, and hiring reduces its rail to 192px. At 720px landing content and profile sections stack; related profiles retain two columns. At 700px hiring becomes one column with four compact steps across the top. Hiring channel choices move from three columns to two at 900px. Mobile gutters are 20–24px.

The landing's five staggered portrait positions are a surface-specific composition, not a universal grid for every page. Profile heroes instead use a portrait/text split; sample content uses paired columns and readable measures.

## Elevation & Depth

The world is predominantly flat. Portraits, tinted sections, paper panels, and fine borders establish hierarchy; sample sheets do not cast shadows. The one overlay shadow belongs to the mobile navigation (`0 12px 28px #15362d15`). The landing sample handoff rotates by -1 degree on desktop and returns upright on mobile.

**The Flat Content Rule.** Keep content on the page plane; reserve the observed soft shadow for the navigation overlay. Do not generalize that exception into elevated cards.

## Shapes

Portraits and sample sheets have sharp rectangular edges. Profile and hiring portraits use 4:5 containers; mobile profile heroes switch to a square crop with object-position center 24%, while the mobile directory uses 2:3 image boxes. Main actions are pills, form fields and options are gently rounded, and step markers are circles. SVG line arrows and CSS-drawn disclosure marks provide direction. These shapes coexist intentionally: rounded actions do not imply rounded imagery.

## Components

### Buttons

Primary actions are forest pills with light labels. Landing actions use the primary token; profile actions use 14px 24px padding and a 54px minimum height. Hiring uses the hire token with a 48px minimum height. Secondary hiring actions are transparent, outlined pills; back actions are transparent and underline on hover. Disabled hiring actions use muted green-gray fills or borders and a not-allowed cursor.

Marketing primary hover and pressed colors are tokenized. Landing color changes take .18s ease; hiring button colors and borders take .15s ease. Profile actions change immediately. Marketing keyboard focus uses a 2px ring with 5px offset; profile links use forest with 6px offset. Hiring uses a 3px ring in `#49683b`, offset 4px. Footer focus changes to leaf for contrast.

### Chips

The recommendation badge is a small, noninteractive green label. It conveys an engine recommendation, not a filter or selected control. Do not invent hover or pressed behavior for it.

### Cards / Containers

Role selection options are white, outlined, rounded rows with native radio controls. Selection uses a pale wash and stronger border; hover uses option-hover and field-border. Sample sheets use white, a fine `#c8d3c9` border, and the recorded padding. Marketing role and plan collections rely primarily on dividers rather than individual cards.

### Inputs / Fields

Inputs and textareas use white fill, forest text, field-border, the field radius, and recorded padding. Textareas have a 132px minimum height and vertical resize. Search wraps the input in an 8px container and uses a 3px focus-within ring with 3px offset. Field labels remain visible; placeholder copy is muted. Errors use the red wash, red border, and red text together.

### Navigation

The marketing header uses a text wordmark, ordinary text links with a 44px minimum target height, and hover underlines. Below 900px a native details/summary menu exposes links and language selection. The footer repeats navigation on forest and has a native language select. Hiring uses a wordmark and directory return link, then a numbered step rail; current steps fill forest, completed steps fill pale green.

### Portrait links and motion

The directory portrait and its persistent role label form one link. Hover and keyboard focus lift the image by 7px and increase saturation to 1.06, over .32s with `cubic-bezier(.16,1,.3,1)` for transform. Related profile cards underline their title on hover. Essential names and responsibilities do not depend on these effects.

Marketing reduced-motion rules set animation and transition durations to .01ms and restore automatic scrolling. Hiring removes transitions; its loading spinner slows from a 1s rotation to 2s. This documents the current implementation rather than asserting that all animation stops.

## Do's and Don'ts

### Do:

- **Do** preserve the original painted portrait material and sharp image edges.
- **Do** keep labels readable without hover and retain visible keyboard focus.
- **Do** retain real native inputs, explicit selected states, and distinct error messages.
- **Do** preserve the light local scope when these surfaces sit inside the existing themed app.

### Don't:

- **Don't** replace fictional role illustrations with claims of real employees or verified customer outcomes.
- **Don't** spread the handwritten annotation face into controls or long copy.
- **Don't** turn the five-person landing arrangement into a layout requirement for other surfaces.
- **Don't** import dashboard neon or dark-theme colors into this scoped world without an approved system change.

Not canonized: the unchanged dashboard themes are outside this scope, not drift to repair. No craft-floor defect is promoted into a reusable rule by this source-based documentation pass; visual finish findings remain owned by the finish review.
