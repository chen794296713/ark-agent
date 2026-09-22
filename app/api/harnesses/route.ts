import { requireAuth, json } from "@/lib/api";
import { HARNESS_IDS, HARNESSES, type Harness } from "@/lib/harness";
import { HARNESS_PROFILES } from "@/lib/harness/profiles";
import { enabledHarnesses } from "@/lib/harness/provisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which harnesses this deployment can actually run, and what each one supports.
 *
 * Exists because the enablement rule is server-side — it reads
 * `ATG_ENABLED_HARNESSES` and the Manager's `category_id` map, neither of which
 * a client component can see. Without this, every harness picker rendered all
 * four and a user could choose Codex, fill in a whole brief, and only discover
 * on submit that `POST /api/agents` refuses it with a 422.
 *
 * Deliberately NOT in the payload: `category_id`. It is an internal identifier
 * for a third-party service and the browser has no use for it.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.res) return auth.res;

  const enabled = new Set<Harness>(enabledHarnesses());
  return json({
    harnesses: HARNESS_IDS.map((id) => {
      const def = HARNESSES[id];
      const profile = HARNESS_PROFILES[id];
      return {
        id,
        label: def.label,
        short: def.short,
        vendor: def.vendor,
        capabilities: def.capabilities,
        /** False means a hire on this harness will be refused. */
        enabled: enabled.has(id),
        /**
         * Contract questions still open against this runtime. Rendered as
         * "unverified on this runtime" rather than hidden — a capability nobody
         * has checked is not the same as one that is absent.
         */
        confirms: profile.confirms,
      };
    }),
    /** Convenience for a picker that just needs the allowed set. */
    enabled: [...enabled],
  });
}
