import "server-only";

/**
 * Fixtures for the OPTIONAL demo workspace (`SEED_DEMO=1`).
 *
 * This is the fictional roster — Nova, Atlas, Mei, Juno — with invented VM ids,
 * uptimes, activity lines and invoices. It exists so a developer or a CI run can
 * see a populated dashboard, and it is refused outright under
 * `NODE_ENV=production` (see lib/db/seed.ts).
 *
 * It lives here rather than in lib/data.ts, and is `server-only`, for one
 * concrete reason: lib/data.ts is imported by the landing page, so every export
 * in it is reachable from the client bundle. Fake agents have no business being
 * shipped to a browser, and the import boundary now says so rather than relying
 * on the bundler to tree-shake them.
 */
import { ANNUAL_DISCOUNT, planPrice, type Currency, type PlanTier } from "../pricing";
import { c } from "../theme";
import { rolesData } from "../data";

const LIME = c.lime;

export interface ActItem {
  t: string;
  txt: string;
  tag: string;
  tagC: string;
}

export interface TaskItem {
  txt: string;
  sym: string;
  c: string;
  tc: string;
  meta: string;
}

export interface PerfItem {
  label: string;
  val: string;
  delta: string;
  w: string;
}

export interface QueueItem {
  id: string;
  txt: string;
  impact: string;
}

export interface ChatMsg {
  who: "me" | "them";
  txt: string;
  meta: string;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  engine: string;
  hue: string;
  mono: string;
  st: string;
  sc: string;
  vm: string;
  up: string;
  credits: string;
  chansTxt: string;
  line: string;
  act: ActItem[];
  tasks: TaskItem[];
  perfNote: string;
  perf: PerfItem[];
  queue: QueueItem[];
  chat: ChatMsg[];
}

export const agentsData: Agent[] = [
  {
    id: "nova",
    name: "Nova",
    role: "Sales Prospector",
    engine: "OpenClaw",
    hue: LIME,
    mono: "N",
    st: "WORKING",
    sc: c.green,
    vm: "sgp-04",
    up: "12d 4h",
    credits: "6,420",
    chansTxt: "TG · WA",
    line: "Qualifying 12 new leads · last action 2 min ago",
    act: [
      { t: "09:41 TODAY", txt: "Qualified Meridian Logistics — booked intro call for Tue 10:00", tag: "MEETING", tagC: c.green },
      { t: "09:32", txt: "Drafted follow-up sequence for 12 prospects (awaiting send window)", tag: "DRAFT", tagC: c.muted },
      { t: "08:55", txt: "Enriched 38 contacts from the SEA logistics list", tag: "RESEARCH", tagC: c.muted },
      { t: "08:12", txt: "Flagged 2 replies that mention budget — needs your review", tag: "REVIEW", tagC: c.amber },
      { t: "YESTERDAY", txt: "Sent 46 personalized first-touch messages (31% open so far)", tag: "OUTREACH", tagC: c.muted },
      { t: "YESTERDAY", txt: "Self-review completed — 1 improvement queued for approval", tag: "LEARNING", tagC: LIME },
    ],
    tasks: [
      { txt: "Build a list of 50 target accounts", sym: "✓", c: c.green, tc: c.faint, meta: "DONE · MON" },
      { txt: "Send intro sequence to new leads", sym: "◌", c: LIME, tc: c.text, meta: "IN PROGRESS · 38/46" },
      { txt: "Qualify replies & book intro calls", sym: "◌", c: LIME, tc: c.text, meta: "IN PROGRESS" },
      { txt: "Weekly pipeline report", sym: "·", c: c.faint, tc: c.muted, meta: "QUEUED · FRI 17:00" },
    ],
    perfNote: "Tuesday 10–11am is the best send window for logistics ICP. Case-study openers outperform intro blurbs 2:1.",
    perf: [
      { label: "Reply rate", val: "31%", delta: "+4", w: "31%" },
      { label: "Meetings booked", val: "9", delta: "+2", w: "64%" },
      { label: "Lead quality score", val: "8.2/10", delta: "+0.3", w: "82%" },
    ],
    queue: [
      { id: "q1", txt: "Shorten follow-up #2 to three lines", impact: "EXPECTED +6% REPLY RATE" },
      { id: "q2", txt: "Skip companies with <20 employees", impact: "EXPECTED +0.8 LEAD QUALITY" },
    ],
    chat: [
      { who: "them", txt: "Morning! 46 first-touch messages went out. Two replies mention budget — I flagged them for your review.", meta: "NOVA · 08:14 · VIA TELEGRAM" },
      { who: "me", txt: "Nice. Prioritize the logistics accounts this week.", meta: "YOU · 08:31" },
      { who: "them", txt: "Done — reordered the queue. Logistics accounts get first send window (Tue 10:00). I’ll report tonight at 18:00.", meta: "NOVA · 08:31" },
    ],
  },
  {
    id: "atlas",
    name: "Atlas",
    role: "Customer Support",
    engine: "Hermes",
    hue: c.blue,
    mono: "A",
    st: "WORKING",
    sc: c.green,
    vm: "sgp-02",
    up: "34d 1h",
    credits: "8,210",
    chansTxt: "WA · WeChat · Web",
    line: "64 tickets resolved this week · CSAT 4.8",
    act: [
      { t: "09:44 TODAY", txt: "Resolved WeChat ticket #482 — shipping delay, voucher issued per policy", tag: "RESOLVED", tagC: c.green },
      { t: "09:21", txt: "Escalated refund request over ¥2,000 to you (per rules)", tag: "ESCALATED", tagC: c.amber },
      { t: "08:40", txt: "Updated FAQ memory: new return-window policy", tag: "LEARNING", tagC: LIME },
      { t: "YESTERDAY", txt: "22 conversations across WhatsApp & web chat, median first reply 28s", tag: "SUMMARY", tagC: c.muted },
    ],
    tasks: [
      { txt: "Answer inbound across all channels", sym: "◌", c: LIME, tc: c.text, meta: "ALWAYS ON" },
      { txt: "Escalate refunds > ¥2,000", sym: "◌", c: LIME, tc: c.text, meta: "RULE" },
      { txt: "Weekly CSAT digest", sym: "·", c: c.faint, tc: c.muted, meta: "QUEUED · FRI" },
    ],
    perfNote: "Customers asking about shipping want a date, not an apology. Leading with the date lifted CSAT 0.4.",
    perf: [
      { label: "CSAT", val: "4.8/5", delta: "+0.2", w: "96%" },
      { label: "First reply time", val: "28s", delta: "−9s", w: "88%" },
      { label: "Auto-resolution rate", val: "78%", delta: "+5", w: "78%" },
    ],
    queue: [{ id: "q1", txt: "Add proactive delay notices for SF Express orders", impact: "EXPECTED −12% INBOUND TICKETS" }],
    chat: [
      { who: "them", txt: "One escalation waiting: refund request ¥2,350 from a repeat customer (order #8841). Recommend approving — full notes attached.", meta: "ATLAS · 09:21 · VIA WECHAT" },
      { who: "me", txt: "Approved, go ahead.", meta: "YOU · 09:25" },
      { who: "them", txt: "Refund processed and customer notified. I’ve noted the damaged-packaging pattern — third case from that warehouse this month.", meta: "ATLAS · 09:26" },
    ],
  },
  {
    id: "mei",
    name: "Mei",
    role: "Admin Assistant",
    engine: "OpenClaw",
    hue: "#F472B6",
    mono: "M",
    st: "SCHEDULED",
    sc: c.muted,
    vm: "sgp-04",
    up: "21d 6h",
    credits: "2,140",
    chansTxt: "WeChat · Email",
    line: "Idle · next run 14:00 — inbox sweep & calendar prep",
    act: [
      { t: "07:00 TODAY", txt: "Morning brief sent: 3 meetings, 2 contracts awaiting signature, flight check-in open", tag: "BRIEF", tagC: c.muted },
      { t: "YESTERDAY", txt: "Rescheduled supplier call, resolved double-booking on Thursday", tag: "CALENDAR", tagC: c.muted },
      { t: "YESTERDAY", txt: "Filed 12 invoices to the accounting folder, tagged by vendor", tag: "DOCS", tagC: c.muted },
    ],
    tasks: [
      { txt: "Inbox sweep — flag what needs Wei", sym: "◌", c: LIME, tc: c.text, meta: "DAILY 14:00" },
      { txt: "Morning brief at 07:00", sym: "✓", c: c.green, tc: c.faint, meta: "DONE TODAY" },
      { txt: "Prep board-meeting folder", sym: "·", c: c.faint, tc: c.muted, meta: "QUEUED · JUN 18" },
    ],
    perfNote: "Wei never reads newsletters before 18:00 — moved them out of the priority digest entirely.",
    perf: [
      { label: "Items handled w/o escalation", val: "91%", delta: "+3", w: "91%" },
      { label: "Avg brief read-through", val: "88%", delta: "+6", w: "88%" },
      { label: "Scheduling conflicts caught", val: "6", delta: "+2", w: "60%" },
    ],
    queue: [{ id: "q1", txt: "Auto-archive vendor newsletters, weekly digest instead", impact: "EXPECTED −20 MIN/WK OF NOISE" }],
    chat: [
      { who: "them", txt: "Your 14:00 with the landlord conflicts with the investor call. Move the landlord to 16:30 Thursday?", meta: "MEI · YESTERDAY · VIA WECHAT" },
      { who: "me", txt: "Yes, do that.", meta: "YOU · YESTERDAY" },
      { who: "them", txt: "Moved and confirmed with both sides. Calendar is clean for tomorrow.", meta: "MEI · YESTERDAY" },
    ],
  },
  {
    id: "juno",
    name: "Juno",
    role: "Content Creator",
    engine: "Hermes",
    hue: "#A78BFA",
    mono: "J",
    st: "NEEDS REVIEW",
    sc: c.amber,
    vm: "fra-01",
    up: "8d 12h",
    credits: "1,650",
    chansTxt: "Slack",
    line: "2 drafts awaiting your approval since 08:30",
    act: [
      { t: "08:30 TODAY", txt: "Draft ready: “How we cut fulfillment time 40%” case study — awaiting approval", tag: "REVIEW", tagC: c.amber },
      { t: "08:10", txt: "Draft ready: LinkedIn post series (3) for next week", tag: "REVIEW", tagC: c.amber },
      { t: "YESTERDAY", txt: "Published newsletter #14 — 42% open rate, 380 clicks", tag: "PUBLISHED", tagC: c.green },
    ],
    tasks: [
      { txt: "Case study: fulfillment time", sym: "!", c: c.amber, tc: c.text, meta: "AWAITING APPROVAL" },
      { txt: "LinkedIn series for next week", sym: "!", c: c.amber, tc: c.text, meta: "AWAITING APPROVAL" },
      { txt: "Newsletter #15", sym: "·", c: c.faint, tc: c.muted, meta: "QUEUED · MON" },
    ],
    perfNote: "Posts with a concrete number in the first line get 2.3× the engagement. Adopting as default.",
    perf: [
      { label: "Newsletter open rate", val: "42%", delta: "+5", w: "42%" },
      { label: "Posts published", val: "11", delta: "+3", w: "73%" },
      { label: "Approval-first-pass rate", val: "81%", delta: "+9", w: "81%" },
    ],
    queue: [{ id: "q1", txt: "Lead every post with a concrete metric", impact: "EXPECTED +2.3× ENGAGEMENT" }],
    chat: [
      { who: "them", txt: "Two drafts are ready for your sign-off. The case study is the strong one — want me to tighten the intro before you read?", meta: "JUNO · 08:31 · VIA SLACK" },
    ],
  },
];


/**
 * Display name -> role id, so the seed can map `agentsData[].role` (a human
 * string) back onto the catalog it has to satisfy a foreign key against.
 */
export const roleIdByName: Record<string, string> = Object.fromEntries(
  rolesData.map((r) => [r.name, r.id]),
);

// ---------------------------------------------------------------------------
// Billing fixtures
//
// The demo workspace's money used to be stored as formatted dollar strings,
// which made it impossible to show a CN visitor a ¥ figure and forced the seed
// to scrape digits back out of "$316.80". Everything below is now derived from
// the ladder in lib/pricing.ts instead, so both currencies fall out for free.
// ---------------------------------------------------------------------------

/** The seeded roster: Atlas + Nova on Professional, Mei + Juno on Associate. */
/** The seeded demo roster: Atlas + Nova on Professional, Mei + Juno on Associate. */
const demoSeatMix: ReadonlyArray<readonly [PlanTier, number]> = [
  ["professional", 2],
  ["associate", 2],
];

/**
 * What one monthly cycle of the demo roster invoices for, in minor units.
 *
 * The only survivor of the old billing-fixture machinery: `invoiceFixtures`
 * prices the seeded invoices from it so they agree with the ladder in
 * lib/pricing.ts. Everything else that lived here — `getBillDatasets`, the
 * proration helpers, the fabricated bar heights — was rendering invented usage
 * to real customers and is gone; the billing screen reads
 * `GET /api/billing/usage` now.
 */
export function demoCycleTotal(currency: Currency): number {
  const monthly = demoSeatMix.reduce(
    (sum, [tier, seats]) => sum + planPrice(tier, currency) * seats,
    0,
  );
  // Annual discount applies because the seeded workspace bills annually.
  return Math.round(monthly - monthly * ANNUAL_DISCOUNT);
}

/**
 * Demo invoice history for the seeded workspace — static prototype chrome, but
 * priced off the ladder so it agrees with the estimate card. April is
 * deliberately a CNY/Alipay invoice: it is the only fixture that exercises the
 * per-invoice currency path, where rendering the stored minor units with the
 * *viewer's* currency would silently turn ¥2,267.20 into $2,267.20.
 */
/**
 * A seeded demo invoice. Carries its own currency and settling provider because
 * invoices are historical records — a ¥ invoice stays ¥ no matter which
 * currency the viewer is browsing in.
 */
export interface InvoiceFixture {
  /** Issue date, parsed by the seed into `issued_at` / `paid_at`. */
  issued: string;
  /** Amount in `currency`'s minor units — US cents or 人民币分. */
  amountMinor: number;
  currency: Currency;
  provider: "stripe" | "alipay";
}

export const invoiceFixtures: InvoiceFixture[] = [
  { issued: "Jun 1, 2026", amountMinor: demoCycleTotal("usd"), currency: "usd", provider: "stripe" },
  { issued: "May 1, 2026", amountMinor: demoCycleTotal("usd"), currency: "usd", provider: "stripe" },
  { issued: "Apr 1, 2026", amountMinor: demoCycleTotal("cny"), currency: "cny", provider: "alipay" },
];
