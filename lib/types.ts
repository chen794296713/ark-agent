/**
 * Shared domain types.
 *
 * Deliberately small: everything the API returns is typed by the DTOs in
 * lib/serializers.ts and lib/client-api.ts. What remains here is the reference
 * catalog's shape (lib/data.ts) plus `Lang`, which twenty-odd modules import.
 *
 * The presentational prototype types that used to live here — `Agent`,
 * `ActItem`, `TaskItem`, `PerfItem`, `QueueItem`, `ChatMsg`, `InvoiceFixture` —
 * described the fictional demo roster and now live with it in
 * lib/db/demo-fixtures.ts, behind `server-only`. `BillDataset` described the
 * invented billing chart and is gone entirely; see lib/services/billing.ts.
 */
import type { PlanTier } from "@/lib/pricing";

export type Lang = "en" | "zh" | "zht" | "ja";

export interface Role {
  id: string;
  name: string;
  mono: string;
  hue: string;
  blurb: string;
  /**
   * Cheapest tier that can run the role. The landing roster's "from …/mo" line
   * formats it against the visitor's currency instead of storing a price, and
   * the seed writes it to agent_roles.min_plan.
   */
  minPlan: PlanTier;
}

export interface ChannelField {
  k: string;
  label: string;
  ph: string;
}

export interface ChannelDef {
  name: string;
  desc: string;
  fields: ChannelField[];
}

/** Seeded default brief text for a role: `i` instructions, `r` rules. */
export interface GenText {
  i: string;
  r: string;
}
