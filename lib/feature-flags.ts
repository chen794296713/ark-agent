/**
 * Build-time feature gates.
 *
 * These are `NEXT_PUBLIC_*` so a client component can read them, which means
 * they are inlined at build time and are NOT secrets — only ever use them to
 * hide something that is merely internal, never to protect something. Anything
 * that must actually be denied is checked server-side (see
 * `requirePlatformRole` in lib/api.ts for the pattern).
 */

/**
 * `/directions` is an internal design-review artefact: three brand-direction
 * mockups, copy that reads "← Back to prototype", and an invitation to
 * "say the word and I'll re-skin everything". It was linked from the public
 * landing footer and the signed-in dashboard sidebar, which is not where a
 * design pitch belongs once real customers arrive.
 *
 * The DirectionSwitcher control is a genuine user-facing feature and is
 * unaffected — only this page and its two entry points are gated.
 */
export const SHOW_DIRECTIONS = process.env.NEXT_PUBLIC_SHOW_DIRECTIONS === "1";
