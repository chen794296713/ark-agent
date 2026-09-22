/**
 * The shared reference catalog: the job roles, their marketing copy, the
 * default brief text each role falls back to when no LLM key is configured, and
 * the credential schema for each messaging channel.
 *
 * Everything here is real product data that both the seed and the client read.
 * The fictional demo roster that used to live alongside it now sits in
 * lib/db/demo-fixtures.ts, behind `server-only`.
 */
import { c, roleHue } from "./theme";
import type { ChannelDef, GenText, Role } from "./types";

const LIME = c.lime;

export const rolesData: Role[] = [
  { id: "prospector", name: "Sales Prospector", mono: "S", hue: roleHue.prospector, blurb: "Lead lists, qualification, booked calls", minPlan: "associate" },
  { id: "salesmkt", name: "Sales & Marketing", mono: "M", hue: roleHue.salesmkt, blurb: "Campaigns, follow-ups, CRM hygiene", minPlan: "associate" },
  { id: "admin", name: "Admin Assistant", mono: "A", hue: roleHue.admin, blurb: "Inbox, calendar, documents, reminders", minPlan: "associate" },
  { id: "hr", name: "HR Recruiter", mono: "H", hue: roleHue.hr, blurb: "Sourcing, screening, scheduling", minPlan: "associate" },
  { id: "support", name: "Customer Support", mono: "C", hue: roleHue.support, blurb: "24/7 answers on every channel", minPlan: "associate" },
  { id: "legal", name: "Legal Reviewer", mono: "L", hue: roleHue.legal, blurb: "Contract review, risk flags, redlines", minPlan: "professional" },
  { id: "content", name: "Content Creator", mono: "W", hue: roleHue.content, blurb: "Posts, newsletters, SEO pages", minPlan: "associate" },
  { id: "opc", name: "OPC Operator", mono: "O", hue: roleHue.opc, blurb: "A whole one-person company", minPlan: "director" },
];

/**
 * Landing roster grid copy (longer blurbs), keyed by role id. The "from …/mo"
 * line the grid renders is derived from `minPlan` at paint time, so it follows
 * the visitor's currency instead of freezing a dollar figure into the data.
 */
export const landingRoles: Array<Role & { long: string; featured?: boolean }> = [
  { ...rolesData[0], long: "Builds lists, qualifies leads and books intro calls while you sleep." },
  { ...rolesData[1], long: "Runs campaigns, follow-ups and CRM hygiene end-to-end." },
  { ...rolesData[2], long: "Owns your inbox, calendar, documents and reminders." },
  { ...rolesData[3], long: "Sources candidates, screens résumés and schedules interviews." },
  { ...rolesData[4], long: "Answers on every channel, 24/7, in your tone of voice." },
  { ...rolesData[5], long: "Reads contracts, flags risk and drafts redlines for sign-off." },
  { ...rolesData[6], long: "Writes posts, newsletters and SEO pages on your calendar." },
  { ...rolesData[7], long: "Runs an entire one-person company — back office included.", featured: true },
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

export const channelDefs: ChannelDef[] = [
  { name: "Telegram", desc: "Bot API — instant setup", fields: [{ k: "token", label: "BOT TOKEN", ph: "123456:ABC-DEF…" }, { k: "user", label: "BOT USERNAME", ph: "@arkagent_bot" }] },
  { name: "WhatsApp", desc: "WhatsApp Business Cloud API", fields: [{ k: "phone", label: "BUSINESS PHONE", ph: "+65 8123 4567" }, { k: "key", label: "API KEY", ph: "EAAG…" }] },
  { name: "WeChat 微信", desc: "Official account 公众号", fields: [{ k: "appid", label: "APPID", ph: "wx1a2b3c…" }, { k: "secret", label: "APPSECRET", ph: "••••••••" }] },
  { name: "LINE", desc: "LINE Messaging API", fields: [{ k: "cid", label: "CHANNEL ID", ph: "165…" }, { k: "secret", label: "CHANNEL SECRET", ph: "••••••••" }] },
  { name: "Slack", desc: "Workspace bot", fields: [{ k: "url", label: "WORKSPACE URL", ph: "ark.slack.com" }, { k: "token", label: "BOT TOKEN", ph: "xoxb-…" }] },
  { name: "Email", desc: "Dedicated agent inbox + forwarding", fields: [{ k: "addr", label: "AGENT ADDRESS", ph: "nova@arkagent.ai" }, { k: "fwd", label: "FORWARD TO", ph: "wei@company.com" }] },
];


/** Hero employee-card rotating feed. */
export const heroFeed = [
  { time: "09:41", txt: "Qualified lead: Meridian Logistics — booked intro call" },
  { time: "09:38", txt: "Replied to 3 support tickets via WhatsApp" },
  { time: "09:32", txt: "Drafted follow-up sequence for 12 prospects" },
  { time: "09:27", txt: "Screened 8 résumés → 2 shortlisted for Wei" },
  { time: "09:20", txt: "Self-review queued: +4% reply rate this week" },
  { time: "09:14", txt: "Enriched 38 contacts from the SEA logistics list" },
];


