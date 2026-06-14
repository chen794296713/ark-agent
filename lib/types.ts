/** Shared domain types for the ArkAgent prototype. */

export type Lang = "en" | "zh" | "zht" | "ja";

export type Screen =
  | "landing"
  | "auth"
  | "hire"
  | "dashboard"
  | "payment"
  | "directions";

export interface Role {
  id: string;
  name: string;
  mono: string;
  hue: string;
  blurb: string;
}

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

export interface ChannelField {
  k: string;
  label: string;
  ph: string;
}

export interface ChannelDef {
  name: string;
  desc: string;
  connected: boolean;
  note: string;
  fields: ChannelField[];
}

export interface GenText {
  i: string;
  r: string;
}

export interface BillDataset {
  label: string;
  cr: string;
  inc: string;
  w: string;
  inv: string;
  seatsLabel: string;
  seats: string;
  overLabel: string;
  over: string;
  disc: string;
  total: string;
  x: [string, string, string];
  bars: Array<[number, string]>;
  /** Optional per-agent override rows for the selected range. */
  pr?: Array<{ cr: string; w: string }>;
}

export interface PlanRow {
  name: string;
  mono: string;
  hue: string;
  plan: string;
  cr: string;
  w: string;
  price: string;
}
