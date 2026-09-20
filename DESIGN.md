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
  workspace-light-bg: "#FEFEFD"
  workspace-light-panel: "#FEFEFD"
  workspace-light-panel-deep: "#F4F6EF"
  workspace-light-hover: "#EEF2E7"
  workspace-light-line: "#DAE1D6"
  workspace-light-line-soft: "#E6EBE1"
  workspace-light-border: "#CDD6C7"
  workspace-light-border-field: "#73836D"
  workspace-light-lime: "#15362D"
  workspace-light-lime-hover: "#2A5142"
  workspace-light-lime-wash: "#EEF2E7"
  workspace-light-lime-wash2: "#E6EDDC"
  workspace-light-lime-border: "#A9BA93"
  workspace-light-ink: "#FEFEFD"
  workspace-light-text: "#10271F"
  workspace-light-text2: "#213C30"
  workspace-light-muted: "#3C5142"
  workspace-light-faint: "#5A6C5B"
  workspace-light-green: "#28623F"
  workspace-light-green-wash: "#EAF2E7"
  workspace-light-green-border: "#ADC5A5"
  workspace-light-amber: "#805C15"
  workspace-light-orange: "#99451F"
  workspace-light-red: "#A23732"
  workspace-light-red-wash: "#F9ECE8"
  workspace-light-red-border: "#D6AAA1"
  workspace-light-blue: "#315F80"
  workspace-light-nav-selected: "#E6EDDC"
  workspace-dark-bg: "#101C17"
  workspace-dark-panel: "#15231C"
  workspace-dark-panel-deep: "#1C2B22"
  workspace-dark-hover: "#223027"
  workspace-dark-line: "#35463A"
  workspace-dark-line-soft: "#2A3B30"
  workspace-dark-border: "#4C5D50"
  workspace-dark-border-field: "#879A7E"
  workspace-dark-lime: "#C6D897"
  workspace-dark-lime-hover: "#D6E5B3"
  workspace-dark-lime-wash: "#293525"
  workspace-dark-lime-wash2: "#303D2A"
  workspace-dark-lime-border: "#61764A"
  workspace-dark-ink: "#10271F"
  workspace-dark-text: "#FEFEF8"
  workspace-dark-text2: "#E3EBDD"
  workspace-dark-muted: "#C0CEB8"
  workspace-dark-faint: "#A0B197"
  workspace-dark-green: "#A2D698"
  workspace-dark-green-wash: "#243822"
  workspace-dark-green-border: "#526D49"
  workspace-dark-amber: "#EAC57D"
  workspace-dark-orange: "#EBB28A"
  workspace-dark-red: "#F3ADA3"
  workspace-dark-red-wash: "#3D2925"
  workspace-dark-red-border: "#80554B"
  workspace-dark-blue: "#ACCBDD"
  workspace-dark-nav-selected: "#35452B"
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
  workspace-heading:
    fontFamily: "Geom, sans-serif"
    fontSize: "32px"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  workspace-title:
    fontFamily: "Geom, sans-serif"
    fontSize: "18px"
    fontWeight: 600
  workspace-label:
    fontFamily: "Instrument Sans, sans-serif"
    fontSize: "13px"
  auth-title:
    fontFamily: "Geom, sans-serif"
    fontSize: "clamp(30px, 3vw, 42px)"
    fontWeight: 650
    lineHeight: 1.1
    letterSpacing: "-0.025em"
rounded:
  workspace-small: "6px"
  workspace-medium: "8px"
  workspace-large: "12px"
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
  workspace-primary:
    backgroundColor: "{colors.workspace-light-lime}"
    textColor: "{colors.workspace-light-ink}"
    rounded: "{rounded.action}"
    padding: "14px 24px"
    height: "50px"
  workspace-secondary:
    textColor: "{colors.workspace-light-text}"
    rounded: "{rounded.action}"
    padding: "12px 18px"
  workspace-field:
    backgroundColor: "{colors.workspace-light-panel}"
    textColor: "{colors.workspace-light-text}"
    rounded: "{rounded.field}"
    padding: "13px 15px"
  workspace-navigation-selected:
    backgroundColor: "{colors.workspace-light-nav-selected}"
    textColor: "{colors.workspace-light-text}"
    rounded: "{rounded.workspace-small}"
    padding: "10px 12px"
  workspace-avatar:
    backgroundColor: "{colors.workspace-light-lime-wash2}"
    textColor: "{colors.workspace-light-lime}"
    rounded: "{rounded.workspace-medium}"
    size: "44px"
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

This system covers the landing page, public agent profiles, hiring, authentication, payment and its return state, and the functional workspace. The approved extension is recorded in `.impeccable/surfaces/app-dashboard-layout-tsx.md`. Marketing and the original hiring flow retain their local light scope. Functional surfaces use the Team Directory global light default and its dark counterpart; previously selected Terminal, Ivory, and Midnight appearances remain supported.

Source evidence includes `app/globals.css`, `lib/theme.ts`, `components/marketing/*.module.css`, `app/hire/hire.module.css`, `app/auth/auth.module.css`, dashboard and payment routes, generated hiring, and the shared Brand, WorkspaceIcon, AgentAvatar, and interaction primitives. Operational pages express the same world with compact headings, explicit labels, restrained dividers, and data-led density.

**Key Characteristics:**

- Original painted portraits with sharp rectangular edges on public and auth surfaces; small rounded role avatars in the workspace.
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

Functional frontmatter colors are named `workspace-light-*` and `workspace-dark-*` after the actual `--c-*` roles. `lime` is a retained API name: it resolves to forest in Team Directory light and leaf in dark. Primary controls pair it with `ink`; ordinary copy uses text, text2, muted, and faint. Status colors identify real success, warning, error, and informational states. Field boundaries use border-field, distinct from decorative lines. Functional component primitives show the default light mode; their sidecar previews bind to live theme variables.

**The Theme Boundary Rule.** Use global semantic variables on functional pages so both mode and saved appearance remain effective. Preserve the local light palette on marketing and the original hiring flow.

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
- **Workspace:** page headings use the recorded workspace-heading role, with related functional headings generally 28–36px. Card titles use 18–20px; controls and copy use 13–16px, secondary labels commonly 12px. Auth is an intentional larger composition: its form heading uses auth-title and its illustrated introduction uses `clamp(40px, 4.5vw, 64px)`.
- **Technical values:** IBM Plex Mono remains for actual identifiers, timestamps, and cron expressions; rendered chat code uses Geist Mono. Ordinary labels and prose use Instrument Sans. Saved legacy appearances may switch the display face through `--f-display`.

**The Readable Roles Rule.** Use display type for role identity and headings; use the body face for tasks, costs, labels, and boundaries.

## Layout

Marketing uses broad whitespace and aligned text columns. The header and first viewport cap at 1680px. Lower landing sections cap at 1440px and normally use 96px vertical / 60px horizontal padding. Profiles cap at 1200px with an 80px total desktop gutter. Hiring caps its header at 1440px and its content at 1200px, with a 232px step rail and flexible form column. Repeated gaps come from the spacing values above; page composition also uses larger 60–120px separations.

At 1100px the lower landing gutters narrow and role rows lose the separate trailing action. At 900px the marketing navigation becomes a native disclosure, the portrait lineup reflows into two columns, and hiring reduces its rail to 192px. At 720px landing content and profile sections stack; related profiles retain two columns. At 700px hiring becomes one column with four compact steps across the top. Hiring channel choices move from three columns to two at 900px. Mobile gutters are 20–24px.

The landing's five staggered portrait positions are a surface-specific composition, not a universal grid for every page. Profile heroes instead use a portrait/text split; sample content uses paired columns and readable measures.

The workspace desktop grid is a 236px sidebar plus flexible content. Page padding is 36px vertically and 40px horizontally. At 1024px, dense three/four-column grids reduce to two and overview/billing splits stack. At 640px, content padding becomes 20px by 16px and navigation becomes a mobile header plus a 280px drawer capped at 86vw. Dense tables and technical content use contained scrolling; flexible columns must be allowed to shrink. Auth uses a 1220px split layout with a 440px form, becoming a single form column below 900px.

## Elevation & Depth

The world is predominantly flat. Portraits, tinted sections, paper panels, and fine borders establish hierarchy; sample sheets do not cast shadows. The marketing overlay shadow belongs to the mobile navigation (`0 12px 28px #15362d15`). The landing sample handoff rotates by -1 degree on desktop and returns upright on mobile.

The functional mobile drawer uses `0 24px 64px var(--c-shadow)` above a themed scrim. Its transform transition is .22s ease; the scrim fades in over .18s. Shared interactive primitives transition background, border, color, shadow, and opacity over .15s ease and apply the same feedback on pointer press. Auth removes transitions for reduced-motion preferences.

**The Flat Content Rule.** Keep ordinary content on the page plane; reserve overlay depth for navigation and dialogs. Do not generalize overlay shadows into elevated cards.

## Shapes

Portraits and sample sheets have sharp rectangular edges. Profile and hiring portraits use 4:5 containers; mobile profile heroes switch to a square crop with object-position center 24%, while the mobile directory uses 2:3 image boxes. Main actions are pills, form fields and options are gently rounded, and step markers are circles. SVG line arrows and CSS-drawn disclosure marks provide direction. These shapes coexist intentionally: rounded actions do not imply rounded imagery.

Functional surface radii use responsive small/medium/large steps: 6/8/12px on desktop and 4/6/8px on mobile. The shared avatar is a distinct 8px rounded image or monogram container. WorkspaceIcon uses 1.6px SVG strokes, rounded caps and joins, and a 19px default size beside persistent text labels. The Brand wordmark uses Geom at 31px or compact 25px, weight 700 and -.04em tracking.

## Components

### Buttons

Primary actions are forest pills with light labels. Landing actions use the primary token; profile actions use 14px 24px padding and a 54px minimum height. Hiring uses the hire token with a 48px minimum height. Secondary hiring actions are transparent, outlined pills; back actions are transparent and underline on hover. Disabled hiring actions use muted green-gray fills or borders and a not-allowed cursor.

Marketing primary hover and pressed colors are tokenized. Landing color changes take .18s ease; hiring button colors and borders take .15s ease. Profile actions change immediately. Marketing keyboard focus uses a 2px ring with 5px offset; profile links use forest with 6px offset. Hiring uses a 3px ring in `#49683b`, offset 4px. Footer focus changes to leaf for contrast.

Functional primary actions bind forest/leaf fill to the matching on-accent ink and use lime-hover for pointer feedback. Auth primary and secondary actions are represented by workspace-primary and workspace-secondary; their respective minimum heights are 50px and 48px. Dashboard actions use compact context-specific sizing, including a pill-shaped hire action. Functional keyboard focus is a 2px accent outline at 3px offset; auth uses 4px offset. Mobile buttons have a 44px minimum target height.

### Chips

The recommendation badge is a small, noninteractive green label. It conveys an engine recommendation, not a filter or selected control. Do not invent hover or pressed behavior for it.

### Cards / Containers

Role selection options are white, outlined, rounded rows with native radio controls. Selection uses a pale wash and stronger border; hover uses option-hover and field-border. Sample sheets use white, a fine `#c8d3c9` border, and the recorded padding. Marketing role and plan collections rely primarily on dividers rather than individual cards.

### Inputs / Fields

Inputs and textareas use white fill, forest text, field-border, the field radius, and recorded padding. Textareas have a 132px minimum height and vertical resize. Search wraps the input in an 8px container and uses a 3px focus-within ring with 3px offset. Field labels remain visible; placeholder copy is muted. Errors use the red wash, red border, and red text together.

Functional form fields use themed panel fill, text, and border-field boundaries. Auth uses the recorded workspace-field geometry, visible 13px labels, and a separate password visibility control. Success and error panels combine the corresponding text, wash, and border tokens with a written message.

### Navigation

The marketing header uses a text wordmark, ordinary text links with a 44px minimum target height, and hover underlines. Below 900px a native details/summary menu exposes links and language selection. The footer repeats navigation on forest and has a native language select. Hiring uses a wordmark and directory return link, then a numbered step rail; current steps fill forest, completed steps fill pale green.

Workspace navigation uses 14px Instrument Sans, SVG icons, 10px 12px padding, and the responsive small radius. Selected rows use nav-selected with primary text and `aria-current`; unselected rows use muted text. The sidebar closes when navigation changes, and the mobile drawer sits above its scrim.

### Agent identity

AgentAvatar uses painted portraits only for exact catalog role identifiers: recruiting, job-applicant, video-creator, sales-outreach, and email-assistant. Custom agents retain their own initials. The default 44px avatar uses a themed pale backing and fine border; its portrait crop is centered at 50% 20%. Never infer a catalog portrait from an unrelated custom name.

### Portrait links and motion

The directory portrait and its persistent role label form one link. Hover and keyboard focus lift the image by 7px and increase saturation to 1.06, over .32s with `cubic-bezier(.16,1,.3,1)` for transform. Related profile cards underline their title on hover. Essential names and responsibilities do not depend on these effects.

Marketing reduced-motion rules set animation and transition durations to .01ms and restore automatic scrolling. Hiring removes transitions; its loading spinner slows from a 1s rotation to 2s. This documents the current implementation rather than asserting that all animation stops.

## Do's and Don'ts

### Do:

- **Do** preserve the original painted portrait material and sharp image edges.
- **Do** keep labels readable without hover and retain visible keyboard focus.
- **Do** retain real native inputs, explicit selected states, and distinct error messages.
- **Do** preserve the marketing and original hiring light scopes while using semantic theme variables for functional pages.
- **Do** keep custom-agent initials distinct from exact catalog-role portraits.

### Don't:

- **Don't** replace fictional role illustrations with claims of real employees or verified customer outcomes.
- **Don't** spread the handwritten annotation face into controls or long copy.
- **Don't** turn the five-person landing arrangement into a layout requirement for other surfaces.
- **Don't** hardcode light workspace colors into controls that must support dark mode and saved appearances.
- **Don't** use technical typography as decoration for ordinary labels or prose.

Not canonized: legacy theme/source comments still describe the former three-direction system; they are historical implementation drift, not authority for new surfaces. Tiny residual utility text is not added to the functional type ramp. This documentation pass records the approved extension and does not repair source or reopen the finish review.
