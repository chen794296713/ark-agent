/**
 * Static content for the ArkAgent prototype — roles, the seeded agent roster,
 * AI-generated brief copy, channel definitions and billing datasets.
 * All ported verbatim from ArkAgent.dc.html.
 */
import { c, roleHue } from "./theme";
import type {
  Agent,
  BillDataset,
  ChannelDef,
  GenText,
  PlanRow,
  Role,
} from "./types";

const LIME = c.lime;

export const rolesData: Role[] = [
  { id: "prospector", name: "Sales Prospector", mono: "S", hue: roleHue.prospector, blurb: "Lead lists, qualification, booked calls" },
  { id: "salesmkt", name: "Sales & Marketing", mono: "M", hue: roleHue.salesmkt, blurb: "Campaigns, follow-ups, CRM hygiene" },
  { id: "admin", name: "Admin Assistant", mono: "A", hue: roleHue.admin, blurb: "Inbox, calendar, documents, reminders" },
  { id: "hr", name: "HR Recruiter", mono: "H", hue: roleHue.hr, blurb: "Sourcing, screening, scheduling" },
  { id: "support", name: "Customer Support", mono: "C", hue: roleHue.support, blurb: "24/7 answers on every channel" },
  { id: "legal", name: "Legal Reviewer", mono: "L", hue: roleHue.legal, blurb: "Contract review, risk flags, redlines" },
  { id: "content", name: "Content Creator", mono: "W", hue: roleHue.content, blurb: "Posts, newsletters, SEO pages" },
  { id: "opc", name: "OPC Operator", mono: "O", hue: roleHue.opc, blurb: "A whole one-person company" },
];

/** Landing roster grid copy (longer blurbs + price), keyed by role id. */
export const landingRoles: Array<Role & { long: string; price: string; featured?: boolean }> = [
  { ...rolesData[0], long: "Builds lists, qualifies leads and books intro calls while you sleep.", price: "from $49/mo" },
  { ...rolesData[1], long: "Runs campaigns, follow-ups and CRM hygiene end-to-end.", price: "from $49/mo" },
  { ...rolesData[2], long: "Owns your inbox, calendar, documents and reminders.", price: "from $49/mo" },
  { ...rolesData[3], long: "Sources candidates, screens résumés and schedules interviews.", price: "from $49/mo" },
  { ...rolesData[4], long: "Answers on every channel, 24/7, in your tone of voice.", price: "from $49/mo" },
  { ...rolesData[5], long: "Reads contracts, flags risk and drafts redlines for sign-off.", price: "from $149/mo" },
  { ...rolesData[6], long: "Writes posts, newsletters and SEO pages on your calendar.", price: "from $49/mo" },
  { ...rolesData[7], long: "Runs an entire one-person company — back office included.", price: "from $399/mo", featured: true },
];

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

/** AI auto-generate copy for the hire brief, keyed by role id. */
export const genTexts: Record<string, GenText> = {
  prospector: {
    i: "Prospect for B2B leads matching our ICP: logistics and e-commerce companies in Southeast Asia, 20–200 employees. Personalize first-touch outreach on LinkedIn and email, qualify for budget and timeline, and book intro calls directly on my calendar.",
    r: "Never contact existing customers or competitors. Max 50 new contacts per day. No discounts or pricing promises — route pricing questions to me. Escalate any reply that mentions legal or compliance.",
  },
  salesmkt: {
    i: "Plan and run our outbound campaigns end-to-end: write sequences, schedule sends, follow up with warm leads, and keep the CRM clean and current. Report campaign performance every Friday at 17:00.",
    r: "Stay within the approved brand-voice doc. No more than 2 follow-ups per lead per week. Get my approval before launching any new campaign or changing pricing copy.",
  },
  admin: {
    i: "Manage my inbox and calendar: triage email, draft replies for my review, schedule and reschedule meetings, prepare a morning brief at 07:00, and file documents and invoices to the right folders.",
    r: "Never send external emails without my approval, except meeting confirmations. Decline meeting requests outside 09:00–18:00. Flag anything from investors or legal immediately.",
  },
  hr: {
    i: "Source and screen candidates for our open roles. Search talent pools, review applications against the role rubric, run first-pass screening chats, and schedule qualified candidates with the hiring manager.",
    r: "Never make or imply an offer. Keep candidate data confidential and in the ATS only. Escalate salary questions to the hiring manager. Reject politely and promptly.",
  },
  support: {
    i: "Answer all inbound customer questions across our channels 24/7 in a warm, concise tone. Resolve order, shipping and account issues using the help-center playbook, and summarize recurring issues weekly.",
    r: "Escalate refunds over ¥2,000 / $300 to me. Never promise delivery dates beyond carrier estimates. If a customer is angry: apologize once, solve fast, offer a human.",
  },
  legal: {
    i: "Review inbound contracts and NDAs against our standard positions. Flag deviations and risks, draft redline suggestions, and produce a one-page summary with a recommendation for every document.",
    r: "Everything is advisory — final sign-off is always human. Never send a redline externally. Flag any indemnity, exclusivity or IP-assignment clause as high priority.",
  },
  content: {
    i: "Write and schedule our content calendar: 3 LinkedIn posts a week, a biweekly newsletter and one SEO article a month. Repurpose customer wins into case studies, matching our voice guide.",
    r: "Every post needs my approval before publishing. Never invent statistics or customer quotes. Avoid competitor comparisons by name. Lead with a concrete result or number.",
  },
  opc: {
    i: "Operate the back office of my one-person company: handle the support inbox, invoice clients on the 1st, chase late payments politely, maintain the CRM, prepare monthly P&L summaries, and remind me about filings and renewals.",
    r: "Never sign anything or commit to spending over $100 without approval. Escalate all tax and legal questions. Keep client data strictly confidential. Daily digest at 18:00; urgent items immediately.",
  },
};

/** Map a human role name back to its id (used in the agent settings tab). */
export const roleIdByName: Record<string, string> = Object.fromEntries(
  rolesData.map((r) => [r.name, r.id]),
);

export const channelDefs: ChannelDef[] = [
  { name: "Telegram", desc: "Bot API — instant setup", connected: true, note: "USED BY NOVA", fields: [{ k: "token", label: "BOT TOKEN", ph: "123456:ABC-DEF…" }, { k: "user", label: "BOT USERNAME", ph: "@arkagent_bot" }] },
  { name: "WhatsApp", desc: "WhatsApp Business Cloud API", connected: true, note: "USED BY NOVA · ATLAS", fields: [{ k: "phone", label: "BUSINESS PHONE", ph: "+65 8123 4567" }, { k: "key", label: "API KEY", ph: "EAAG…" }] },
  { name: "WeChat 微信", desc: "Official account 公众号", connected: true, note: "USED BY ATLAS · MEI", fields: [{ k: "appid", label: "APPID", ph: "wx1a2b3c…" }, { k: "secret", label: "APPSECRET", ph: "••••••••" }] },
  { name: "LINE", desc: "LINE Messaging API", connected: false, note: "—", fields: [{ k: "cid", label: "CHANNEL ID", ph: "165…" }, { k: "secret", label: "CHANNEL SECRET", ph: "••••••••" }] },
  { name: "Slack", desc: "Workspace bot", connected: false, note: "USED BY JUNO (PENDING)", fields: [{ k: "url", label: "WORKSPACE URL", ph: "ark.slack.com" }, { k: "token", label: "BOT TOKEN", ph: "xoxb-…" }] },
  { name: "Email", desc: "Dedicated agent inbox + forwarding", connected: false, note: "—", fields: [{ k: "addr", label: "AGENT ADDRESS", ph: "nova@arkagent.ai" }, { k: "fwd", label: "FORWARD TO", ph: "wei@company.com" }] },
];

/** Hire-flow default channel selection. */
export const hireChannels: Record<string, boolean> = {
  Telegram: true,
  WhatsApp: true,
  "WeChat 微信": false,
  LINE: false,
  Slack: false,
  Email: false,
};

/** Hero employee-card rotating feed. */
export const heroFeed = [
  { time: "09:41", txt: "Qualified lead: Meridian Logistics — booked intro call" },
  { time: "09:38", txt: "Replied to 3 support tickets via WhatsApp" },
  { time: "09:32", txt: "Drafted follow-up sequence for 12 prospects" },
  { time: "09:27", txt: "Screened 8 résumés → 2 shortlisted for Wei" },
  { time: "09:20", txt: "Self-review queued: +4% reply rate this week" },
  { time: "09:14", txt: "Enriched 38 contacts from the SEA logistics list" },
];

/** Dashboard overview live-activity feed. */
export const overviewFeed = [
  { time: "09:44", who: "Atlas", hue: c.blue, txt: "resolved WeChat ticket #482 — voucher issued" },
  { time: "09:41", who: "Nova", hue: c.accent, txt: "booked intro call with Meridian Logistics" },
  { time: "09:21", who: "Atlas", hue: c.blue, txt: "escalated a ¥2,350 refund for your approval" },
  { time: "08:55", who: "Nova", hue: c.accent, txt: "enriched 38 contacts from the SEA list" },
  { time: "08:30", who: "Juno", hue: "#A78BFA", txt: "submitted 2 drafts for your review" },
  { time: "07:00", who: "Mei", hue: "#F472B6", txt: "sent your morning brief — 3 meetings today" },
];

export const invoices = [
  { d: "Jun 1, 2026", amt: "$316.80", st: "PAID" },
  { d: "May 1, 2026", amt: "$316.80", st: "PAID" },
  { d: "Apr 1, 2026", amt: "$237.60", st: "PAID" },
];

export const basePlanRows: PlanRow[] = [
  { name: "Atlas", mono: "A", hue: c.blue, plan: "Professional", cr: "8,210 cr", w: "33%", price: "$149" },
  { name: "Nova", mono: "N", hue: LIME, plan: "Professional", cr: "6,420 cr", w: "26%", price: "$149" },
  { name: "Mei", mono: "M", hue: "#F472B6", plan: "Associate", cr: "2,140 cr", w: "43%", price: "$49" },
  { name: "Juno", mono: "J", hue: "#A78BFA", plan: "Associate", cr: "1,650 cr", w: "33%", price: "$49" },
];

/** Build billing datasets; `custom` depends on the chosen from/to dates. */
export function getBillDatasets(
  billFrom: string,
  billTo: string,
): Record<string, BillDataset> {
  const G = c.border;
  const PROJ = "#39411F";
  const L = LIME;
  return {
    cycle: {
      label: "CREDITS · THIS CYCLE (JUN 1 – 13)", cr: "18,420", inc: "30,000", w: "61%",
      inv: "ESTIMATED INVOICE · JUL 1", seatsLabel: "4 agent seats", seats: "$396.00",
      overLabel: "Projected overage (0 cr)", over: "$0.00", disc: "−$79.20", total: "$316.80",
      x: ["JUN 1", "TODAY", "PROJECTED"],
      bars: [[28, G], [36, G], [31, G], [48, G], [42, G], [22, G], [18, G], [52, G], [61, G], [46, G], [58, G], [72, G], [66, L], [80, PROJ]],
    },
    last: {
      label: "CREDITS · LAST CYCLE (MAY 1 – 31)", cr: "27,910", inc: "30,000", w: "93%",
      inv: "INVOICE · JUN 1 — PAID", seatsLabel: "4 agent seats", seats: "$396.00",
      overLabel: "Overage (0 cr)", over: "$0.00", disc: "−$79.20", total: "$316.80",
      x: ["MAY 1", "MAY 16", "MAY 31"],
      bars: [[44, G], [52, G], [38, G], [61, G], [55, G], [30, G], [26, G], [64, G], [72, G], [58, G], [66, G], [78, G], [84, G], [70, G]],
      pr: [{ cr: "11,840 cr", w: "47%" }, { cr: "9,360 cr", w: "37%" }, { cr: "4,210 cr", w: "84%" }, { cr: "2,500 cr", w: "50%" }],
    },
    d90: {
      label: "CREDITS · LAST 90 DAYS", cr: "71,300", inc: "90,000", w: "79%",
      inv: "3 INVOICES · APR – JUN", seatsLabel: "Agent seats (3 cycles)", seats: "$1,029.60",
      overLabel: "Overage (1,300 cr)", over: "$2.60", disc: "−$160.84", total: "$871.36",
      x: ["MAR 15", "MAY 1", "TODAY"],
      bars: [[22, G], [30, G], [38, G], [34, G], [46, G], [42, G], [55, G], [50, G], [61, G], [58, G], [70, G], [66, G], [76, L], [82, PROJ]],
      pr: [{ cr: "29,410 cr", w: "39%" }, { cr: "23,180 cr", w: "31%" }, { cr: "11,300 cr", w: "75%" }, { cr: "7,410 cr", w: "49%" }],
    },
    custom: {
      label: "CREDITS · " + billFrom + " → " + billTo, cr: "9,940", inc: "13,000", w: "76%",
      inv: "USAGE IN SELECTED RANGE", seatsLabel: "Seat fees (prorated)", seats: "$182.40",
      overLabel: "Overage (0 cr)", over: "$0.00", disc: "−$36.48", total: "$145.92",
      x: [billFrom, "", billTo],
      bars: [[31, G], [42, G], [26, G], [50, G], [44, G], [38, G], [58, G], [47, G], [63, G], [52, G], [40, G], [55, G], [68, L], [74, PROJ]],
      pr: [{ cr: "4,310 cr", w: "17%" }, { cr: "3,150 cr", w: "13%" }, { cr: "1,480 cr", w: "30%" }, { cr: "1,000 cr", w: "20%" }],
    },
  };
}
