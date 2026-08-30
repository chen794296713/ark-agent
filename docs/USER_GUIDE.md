# ArkAgent — User Guide

**For business owners and operators. No technical background needed.**

This guide covers what ArkAgent does today, exactly as it works on screen. Where something
is still being built, this guide says so plainly instead of describing it. Look for the
**Not available yet** notes — they are there so you never waste an afternoon hunting for a
button that has not been made.

**Start here — what actually works today.** You can create an account, hire an agent onto a
real machine, write and revise its brief, queue tasks, chat with it, run a self-review and
approve or dismiss what it proposes, connect four Chinese messaging platforms, watch your
credit line, and pay. That is a real product and it is enough to run an agent.

Four things this guide will keep repeating, because they change how you should use it:

1. **Only your Instructions and your Rules reach the agent's machine.** Every other switch in
   Settings is stored on ArkAgent and is waiting on the runtime team. Write constraints in
   words, not switches.
2. **ArkAgent sends no email.** No password reset, no daily digest, no escalation, ever.
3. **Reminders and schedules have no screen.** The engine is finished; there is nowhere to
   create one.
4. **Templates and the Skills catalogue are empty.** Both pages exist; neither has data behind
   it in this build.

---

## 1. What ArkAgent is

You do not learn an app. You hire an employee.

ArkAgent gives you a place to hire, brief, supervise and pay for AI workers. Each one gets
its own machine, its own job description, its own rules, and its own record of what it did.
You manage it the way you would manage a new hire: you tell it what the job is, you tell it
what it must never do, you check its work, and you adjust.

The mental model that matters:

| Hiring a person | Hiring on ArkAgent |
|---|---|
| Job title | The **role** you pick |
| Their name | The **agent name** you choose |
| Job description | The **instructions** you write |
| "Never do this" list | The **rules and boundaries** you set |
| Tools and logins | The **skills** you switch on |
| Company knowledge | The **context** you give it |
| Standing meetings | The **reminders and schedules** — designed and built, but with no screen to create one yet (section 8) |

Two things to be clear about up front:

- **ArkAgent is the office, not the worker.** Your agent runs on a separate machine operated
  by the runtime service. ArkAgent is where you hire it, brief it, watch it and pay for it.
- **An agent is not a person.** It does what your brief says, within the rules you set. A
  vague brief produces vague work. Section 4 is the most valuable part of this guide.

ArkAgent runs in two markets — **arkagent.ai** worldwide and **iagent.cc** for mainland China
— and in four interface languages: English, 简体中文, 繁體中文 and 日本語. Language, colour
theme (light or dark) and visual style (Terminal, Ivory, Midnight — six palettes in total) are
switched from the **bottom of the dashboard sidebar** on a wide screen, and from the bar across
the top on a phone.

**Display currency is not switchable from inside the dashboard.** There is a currency control
on the public landing page, in the pricing section, and the **Payment** screen switches
currency when you pick your region. Everywhere else the currency follows your interface
language — 简体中文 shows ¥, the other three show $ — until you pin a choice on one of those
two screens, which the browser then remembers.

---

## 2. Getting started

### Creating your account

Go to the sign-in page and choose **Create account**. You need three things:

- your full name,
- a work email,
- a password.

Some deployments also offer **Google** or **WeChat** sign-in. If a button says the provider
is not set up on this deployment, use email and password instead — that always works.

> **Important — password reset is not working yet.** The "Forgot password?" screen accepts
> your email and shows a "reset link sent" confirmation that even tells you the link "expires
> in 30 minutes". **No email is sent, and no reset link exists.** ArkAgent has no mail
> transport of any kind today, so nothing on this screen can reach your inbox. Nothing is
> broken on your side. Until this ships, keep your password somewhere safe. You *can* change
> your password once you are signed in, from **Personal center**.

### What a workspace is

The moment you create an account, ArkAgent creates a **workspace** for you and makes you its
owner. It is named after your first name — "Wei's Workspace" — and it is the container for
everything else:

- every agent you hire,
- your credit allowance and everything you have used against it,
- every invoice and payment order,
- one timezone, which the scheduler treats as authoritative.

It does *not* hold a billing currency: each invoice records the currency it was settled in, and
what you see on screen is a browser preference (section 1).

You do not have to set anything up. There is one workspace per account — the one you own — and
you are already in it.

### What you get on day one

| You get | Where it is |
|---|---|
| An empty roster, ready to hire into | **Overview** |
| The hiring wizard | **+ Hire new agent**, in the sidebar under the menu |
| A billing page that reads zero until you use something | **Billing & usage** |
| A checkout page | **Payment** |
| Your name, password, connected sign-ins and a sign-out button | **Personal center** |

Your workspace starts with **no included credit allowance and nothing used**. Credits and
plans are explained in section 11.

At the bottom of the sidebar there is a permanent credit meter: how many credits you have used
against your allowance, and the overage rate per 1,000 credits. It is on every dashboard
screen, so you never have to go looking to find out what you are spending. On a phone the
sidebar collapses and only the used/allowance figure survives, in the top bar.

> **Two things about this meter to know before you trust it.**
>
> **It does not count your chat.** The sidebar meter — and the "Credits used" tile on
> Overview — read a running total that only the runtime service increments, by reporting
> compute. Web-console messages are recorded separately and do not touch it. Since the runtime
> is not reporting yet, **both of these read 0 no matter how much you chat.** The **Billing &
> usage** page is the one that counts your chat, because it adds up the usage records
> themselves. When the two disagree, Billing & usage is right.
>
> **There is no cycle reset.** The meter has a "Resets in N days" line, but nothing in ArkAgent
> ever sets a reset date on a real account — no job rolls the cycle over and no checkout writes
> one. So the meter says **"Usage this cycle"** instead, and on the Billing page "this cycle"
> means *the calendar month so far, or since you signed up, whichever is later*.

### The menu

| Menu item | What it is for |
|---|---|
| **Overview** | A greeting, four headline numbers, your roster, and a live activity feed |
| **Fleet** | Every agent you have, with search and filters |
| **Templates** | The template gallery (see section 5 — the library is not live yet) |
| **Skills** | The skill catalogue (see section 4.3 — empty until a source is loaded) |
| **Billing & usage** | Credits, estimated invoice, per-agent usage, invoices |
| **Payment** | Buy a plan |
| **Personal center** | Your name, password, connected sign-ins, sign out |

There is no **Channels** item in this menu. A `/dashboard/channels` screen exists in the build
but its nav row is commented out, so nothing links to it — messaging channels are connected
inside each agent's own **Settings** instead (section 10). Staff accounts see one extra row,
**Admin**, which ordinary accounts do not.

**Overview's four numbers, and what each really counts:**

| Tile | What it counts |
|---|---|
| **ACTIVE AGENTS** | Every agent that is not terminated — including paused and errored ones |
| **TASKS THIS WEEK** | Despite the label, every task ever that is *in progress* or *done*. It is not scoped to a week |
| **CREDITS USED** | The workspace running total, which the runtime increments — see the meter caveat above. Reads 0 today however much you chat |
| **NEEDS YOUR REVIEW** | Agents in the NEEDS REVIEW state, plus every pending improvement suggestion across your fleet |

---

## 3. Hiring your first agent

Press **+ Hire new agent**. The wizard is four steps and takes a few minutes.

### Step 1 — Choose the role

Pick a ready-made role, or choose **Custom role** and type your own job title.

**Where this list comes from matters.** The wizard asks ArkAgent for the role list, and
ArkAgent asks the runtime service (the OpenClaw Manager) first. If the Manager answers with
templates, *those* are the roles you see, named and described by the Manager. Only when the
Manager is unreachable or returns nothing do you get ArkAgent's own built-in catalogue, which
is the eight roles below. So do not be surprised if your screen shows a different set — and
if it does, every one of those Manager-supplied roles is priced at the **Associate** minimum,
because the Manager does not tell ArkAgent a minimum plan.

ArkAgent's own eight roles, the ones you see when the Manager is not answering:

| Role | What it is for |
|---|---|
| Sales Prospector | Lead lists, qualification, booked calls |
| Sales & Marketing | Campaigns, follow-ups, CRM hygiene |
| Admin Assistant | Inbox, calendar, documents, reminders |
| HR Recruiter | Sourcing, screening, scheduling |
| Customer Support | Answers on every channel, around the clock |
| Legal Reviewer | Contract review, risk flags, redlines |
| Content Creator | Posts, newsletters, SEO pages |
| OPC Operator | A whole one-person company's back office |

There is a search box, and the list is paged ten at a time. **Custom role** always sits first.
For these eight, the role also decides the minimum plan for the agent: most start at
Associate, Legal Reviewer starts at Professional, and OPC Operator starts at Director.

### Step 2 — Write the job brief

Four boxes:

- **Agent name** — what you will call it. "Aria", "Nova", "Chen".
- **Instructions** — the job description. This is the important one.
- **Rules & boundaries** — the hard limits.
- **First tasks** — type a task, press Enter, repeat. These are queued for the agent.

There is also a **Reminders & schedule** box on this step.

> **Read this before you type in the Reminders box.** What you write there is shown back to
> you on the review screen, but it is **not saved and does not create a schedule.** Treat it
> as a note to yourself. Recurring reminders are covered in section 8 — and are not
> available on screen yet.

Each of Instructions and Rules has an **✦ AUTO-GENERATE** button. See section 6.

### Step 3 — Engine and channels

**Engine** is the runtime your agent runs on. You get three choices:

| Choice | What it means |
|---|---|
| **Auto-match** | Uses the **role's** default engine. You can change it later. |
| **OpenClaw** | The open runtime — the widest set of skills and chat channels. |
| **Hermes** | The precision runtime — deeper reasoning, guardrails, full audit trail. |

> **The Auto-match card overstates itself.** On screen it reads "We read the brief and pick."
> It does not read your brief. Auto-match resolves to whatever default engine the role you
> picked carries — OpenClaw for every built-in role except where the Manager marks a template
> as Hermes. Nothing about your instructions or rules is considered. Picking OpenClaw or
> Hermes yourself gives exactly the same result with none of the guesswork.

You can switch engines later from the agent's Settings, and the change takes effect on its
next cycle.

**Channels** on this step is a preference — which places you expect to talk to it. The web
console is always included and is marked connected the moment the agent is created; every
other channel you tick is recorded against your workspace as **pending**. The note under the
picker tells you to configure tokens in "Dashboard → Channels"; **that menu item does not
exist.** Connecting a real messaging account happens after launch, in the agent's own
Settings (section 10).

### Step 4 — Review and launch

You see a summary — role, name, engine, channels, first tasks, plan, and the note you typed in
the Reminders box — and a launch button. Press it. A machine is requested from the runtime
service, and your brief, rules and first tasks are loaded onto it. A billing seat is created
and its included credits are added to your workspace allowance. You are taken to the agent's
page.

The five-line progress list you watch during launch is an animation on a fixed timer; it runs
alongside the real request rather than reporting it. What tells you the truth is the state you
land on.

If the machine cannot be provisioned, the agent still appears in your fleet, marked **ERROR**,
with the reason recorded in its Activity — and the billing seat is still created. Nothing is
silently lost.

---

### A fully worked example — follow along

Meet the situation: you run a six-person logistics software company in Singapore. You have no
one doing outbound sales. You want an agent that finds prospects, contacts them, and books
calls in your calendar — without embarrassing you.

**Step 1 — Role:** Sales Prospector.

**Step 2 — Agent name:**

```
Nova
```

**Instructions** — copy this shape, replace the specifics with yours:

```
Find and qualify new business for us.

Who we sell to: logistics and freight-forwarding companies in Singapore,
Malaysia, Indonesia and Vietnam with 20-200 employees. The person I want is
the operations director or the head of logistics - not IT, not the CEO of a
1000-person firm.

What to do each week:
1. Build a list of companies that fit, with a named contact and a reason
   they might care right now (new warehouse, new funding, a hiring spree
   for ops roles).
2. Write a first-touch email and a LinkedIn message for each one. Reference
   the specific reason. Two short paragraphs, no bullet lists, no
   "I hope this email finds you well".
3. Follow up twice, four days apart, then stop.
4. When someone replies with interest, ask two questions: what does their
   current process cost them in hours per week, and who else would need to
   be in the room. Then offer three slots from my calendar for a 25-minute
   intro call.
5. Log every contact, every reply and every booked call.

How I want you to sound: direct, specific, a little dry. Never enthusiastic.
Never use the word "solution".

Every Friday at 17:00, give me one page: contacts made, replies, calls
booked, and the three best-fit companies you found that I should look at
myself.
```

**Rules & boundaries** — copy this shape:

```
NEVER:
- Contact anyone at a company already in our customer list, or at
  Kargolink, ShipHub or Portway (competitors).
- Quote a price, offer a discount, or say anything about our pricing.
  Route every pricing question to me.
- Promise a delivery date, an integration, or a feature.
- Send more than 40 new first-touch messages in one day.
- Contact the same person more than three times, ever.
- Say or imply that you are a human being. If asked, say you are an
  assistant working for Wei at <company>.

ALWAYS:
- Send me anything that mentions legal, procurement, security review,
  data protection or a tender, and do not reply to it yourself.
- Stop the sequence the moment someone asks to be removed.
- Use my real calendar availability, never a made-up slot.

ASK ME FIRST:
- Before contacting anyone at a company with over 500 employees.
- Before writing anything that will be published publicly.
```

**First tasks** — add these three, pressing Enter after each:

```
Build a list of 50 target accounts across SG, MY, ID and VN
Draft the first-touch email and LinkedIn message templates for my approval
Send the intro sequence to the first 10 accounts once I approve the templates
```

**Step 3 — Engine:** Auto-match. **Channels:** tick the ones you use.

**Step 4:** Review, then launch.

**What to do in the first hour after launch:** open the agent, go to **Chat**, and ask it to
tell you back what it thinks its job is and what it is not allowed to do. If its answer is
missing something you care about, your brief is missing it too. Go to **Settings** and add it.

---

## 4. The six things that make up an agent

Everything about an agent comes down to six things. Get these right and the agent is useful.
Get them vague and it is not.

### 4.1 The role it plays

The role is the job title — Sales Prospector, Customer Support, Legal Reviewer. It is the
coarsest setting and it does three jobs: it seeds the starting brief, it sets the minimum plan,
and it tells you and everyone else in your company what this agent is for. (For roles supplied
by the runtime service rather than by ArkAgent, only the third is true — see section 3, step 1.)
Once an agent is hired the role is fixed: Settings shows it but will not let you change it.

**How to choose well:** pick the role that describes 80% of the work. Do not pick a role
because it sounds senior. If nothing fits, pick **Custom role** and name the job in the words
your own team would use — "Invoice Chaser", "Tender Watcher", "Shop Floor Reporter".

**One job per agent.** The single most common mistake is hiring one agent to do sales *and*
support *and* bookkeeping. Three agents with three sharp briefs beat one agent with a
sprawling one, every time. Hire the second one when you catch yourself writing "and also" in
the instructions.

### 4.2 Who it is — the name, the voice, the manner

The **agent name** is what you and your team will say out loud. Give it a real name. "Nova"
gets talked about; "Sales Agent 1" does not.

In the agent's **Settings**, under **Behavior**, you also set:

| Setting | What it does | Default |
|---|---|---|
| **Tone** | Professional, Friendly, Concise, Formal or Playful | Professional |
| **Reply language** | "Match the customer", or English / 简体中文 / 繁體中文 / 日本語 | Match the customer |

(**Timezone** is *not* in this card — it lives under **Schedule**, with the working hours it
governs. See section 4.6.)

Under **Autonomy & approvals**:

| Setting | What it does | Default |
|---|---|---|
| **Autonomy** | Suggest only / Ask first / Autonomous — how much it does without checking | Ask first |
| **Approval over** | Require your sign-off for money or commitments at or above this amount (in US dollars, deliberately fixed regardless of your display currency) | 300 |
| **Daily action limit** | A ceiling on actions per day. 0 means unlimited | 0 |
| **Approve external sends** | Hold outbound messages and emails for your approval before they go | Off |

> **Read this before you rely on any switch in Settings.** ArkAgent stores every one of these
> settings against your agent and bumps the agent's config revision when you save. But the
> only two fields ArkAgent currently *sends* to the runtime service are the **Instructions**
> and the **Rules & boundaries** text. Tone, autonomy, approval thresholds, daily limits,
> skills, local-execution tools, working hours and credit caps are recorded here and are
> waiting on the runtime team to read them. Until they do, **the reliable way to constrain an
> agent is to write the constraint into the Instructions and the Rules, in words** — which is
> exactly what section 4.4 is about. Treat the switches as your stated intent, not as an
> enforced control.

**How to set these well:** start tight. Leave autonomy on **Ask first** (its default) and turn
**Approve external sends** on for the first two weeks — and, because of the caveat above, write
the same instruction into your Rules in words: *"Show me every outbound message before it is
sent."* Read what it wanted to send. When you find yourself approving everything without
changing it, loosen. Loosening is a decision you make on evidence; starting loose is a decision
you make on hope.

### 4.3 The skills it can use

Skills are the capabilities the agent is allowed to reach for. In the agent's **Settings**,
under **Skills & tools** — a card marked **OPENCLAW**, because that is the runtime whose
ecosystem this fixed list of fourteen describes — you switch them on and off:

Web research · Email · Calendar · CRM sync · Lead enrichment · Document drafting ·
Spreadsheets · Summarization · Translation · Scheduling · Invoicing · Ticket triage ·
Social posting · Image generation

A new agent starts with **Web research, Email and Summarization** on and the rest off.

Below them is **Local execution** — what the agent may run on its own machine. **File system**
and **Browser** start on; **Code execution**, **Shell** and **Docker** start off:

| Tool | What it means |
|---|---|
| **File system** | Read and write files in its own workspace |
| **Browser** | Browse and automate web pages |
| **Code execution** | Run code to compute and transform data |
| **Shell** | Run shell commands (advanced) |
| **Docker** | Manage containers (advanced) |

**How to choose well:** switch on what the job needs and nothing else. An agent that only
writes copy does not need Shell. Every capability you leave on is a way for a
misunderstanding to become an action. If you do not know what Shell or Docker are, leave
them off — you do not need them.

**The Skills page in the menu** is a browsable catalogue of published skills, with a safety
rating and a note on which engines each one has been tested against. It deliberately shows
"untested" rather than a green tick where nobody has verified compatibility.

> **Not available yet.** No skill source has been loaded into this deployment and nothing has
> been synced, so the catalogue table is empty and the Skills page shows its empty state — the
> one written for "no source has been synced yet", which is deliberately different from "your
> filters match nothing". The switches inside each agent's Settings are a separate, fixed list
> and save normally.

### 4.4 The rules it must never break

This is the section to slow down on.

Instructions tell an agent what to do. **Rules tell it what would be a disaster.** They are
the difference between an assistant and a liability. Write them by imagining the worst
Monday morning of your life and working backwards.

**Ask yourself these six questions and write a rule for each answer:**

1. **What could cost me money?** Discounts, refunds, purchases, commitments, overtime,
   ad spend. → *"Never offer a discount. Escalate every refund over $300 to me."*
2. **What could cost me a customer?** Contacting the wrong person, contacting someone twice,
   arguing, promising a date. → *"Never contact anyone already in our customer list. Never
   promise a delivery date beyond the carrier estimate."*
3. **What could get me in legal trouble?** Claims about results, competitor comparisons,
   invented statistics, health or financial advice, data leaving the country. → *"Never
   invent a statistic or a customer quote. Never name a competitor."*
4. **What must a human always sign off?** Contracts, public posts, offers, anything with your
   name on it. → *"Everything you write is advisory. I sign it, not you."*
5. **What must never be said?** That it is human. Internal pricing. Anything about other
   customers. → *"If asked, say you are an assistant working for me. Never claim to be a
   person."*
6. **What should it do when it is unsure?** This is the rule people forget. → *"When you are
   not sure, stop and ask me. Do not guess."*

**How to write a rule well:**

| Weak | Strong |
|---|---|
| "Be careful with discounts" | "Never offer a discount above 10%. Anything above 10% comes to me first." |
| "Don't spam people" | "Maximum 40 new contacts per day. Maximum 3 messages to any one person, ever." |
| "Handle refunds appropriately" | "Refunds under $50: process and log. $50 and above: send to me with the order number and the reason." |
| "Use good judgement" | *(Delete this. It is not a rule.)* |

Three habits that make rules work:

- **Use numbers.** "Large" and "urgent" are opinions. "$300" and "within 2 hours" are rules.
- **Split NEVER / ALWAYS / ASK ME FIRST.** Three short lists beat one long paragraph.
- **Add a rule every time something goes wrong.** The rules box is a living document. Every
  near-miss is a sentence you were missing.

Also note: the agent never edits its own rules. When it suggests an improvement to itself,
that suggestion waits for you (section 9).

### 4.5 The context it knows about your business

An agent that does not know your prices, your policies or your customers will make things up
in the shape of the truth. Context is how you prevent that.

Today, context lives in two places:

**In the brief.** The fastest and most reliable route. If a fact matters, put it in the
Instructions. Prices, the names of your top ten customers, your refund window, your working
hours, the three things you always say and the two you never say.

**In Knowledge sources.** In the agent's **Settings**, under **Memory & knowledge**, you can
add a list of web addresses the agent may use to ground its answers — your public handbook,
your help centre, your pricing page. Add them one at a time with **+ Add** (or press Enter);
remove them with the ✕. The field accepts any text and does not check that what you typed is
a reachable address, so paste the URL exactly.

The same section also holds:

| Setting | What it does | Default |
|---|---|---|
| **Persistent memory** | Remember context across runs and conversations | On |
| **Retention (days)** | How long that memory is kept | 90 |

Both, and the source list itself, are subject to the caveat in section 4.2: ArkAgent stores
them, and only your Instructions and Rules are pushed to the runtime today.

> **Not available yet — file uploads.** There is no way to upload a PDF, spreadsheet or Word
> document to an agent today. Until that ships, paste the important parts into the
> Instructions, or publish the document at a web address and add it under Knowledge sources.

**What to give an agent:** your price list, your standard terms, your refund and escalation
policy, your tone-of-voice examples (three good ones beat a description), your product names
spelled the way you spell them, and the top twenty questions customers ask with the answers
you would give.

**What not to give an agent:** passwords, API keys, bank or card details, government ID
numbers, and personal data about customers or staff that the job does not require. Never
paste a credential into a brief, a rule or a knowledge source. The only place ArkAgent asks
for a third-party credential is the Channels card in an agent's Settings, where each platform
has its own fields and the secrets are masked. There is nowhere else that should ever ask you
for one.

**What happens to what you give it:** everything is stored against your workspace in
ArkAgent's database. Your **Instructions** and **Rules** are additionally sent to the agent's
own machine — joined together and delivered as the very first item on its task list — and are
re-sent whenever you save a change. Knowledge sources and the other settings stay on ArkAgent
for now. Anything you put in the brief may be repeated back by the agent to whoever it is
talking to. Write with that in mind: if it would be bad for a prospect to read it, it does not
belong in the Instructions.

### 4.6 The reminders and schedules that tell it when to act

An agent with no schedule only acts when you talk to it. A schedule is what makes it show up
on Monday morning without being asked.

Two different things share the word "schedule", and it is worth keeping them apart:

**Working hours — the settings exist and save.** In the agent's **Settings**, under
**Schedule**:

| Setting | What it does | Default |
|---|---|---|
| **Always on (24/7)** | Turn off to restrict the agent to working hours | On |
| **Start / End** | The working window. *Only appears once Always on is switched off* | 09:00 – 18:00 |
| **Working days** | Which days of the week it works. *Also hidden while Always on is on* | Mon–Fri |
| **Timezone** | Which clock all of the above is read in — picked from a fixed list | Asia/Singapore |
| **Heartbeat** | How often it wakes to check for work: Every 5 min, Every 15 min, Every 30 min, Hourly | Every 15 min |

Same caveat as everywhere else in Settings (section 4.2): these are stored on your agent and
are not yet transmitted to the runtime, so today they express your intent rather than gate the
agent's clock. If working hours genuinely matter, say so in the Instructions as well.

**Recurring reminders — see section 8.**

---

## 5. The template gallery

A template is a complete, pre-written agent: the role, the brief, the rules, the skills, the
context prompts and a suggested set of schedules, packaged so that hiring becomes a review
rather than a blank page.

What a template gives you, versus starting from a role:

| Starting from a role | Starting from a template |
|---|---|
| A job title and a starter brief | A finished brief, rules and skill list, written for a specific job |
| You write everything | You read and adjust |
| You discover the gaps in production | The gaps were found by whoever published it |

**Templates** is in your menu. Starting an agent from a template never provisions anything by
itself — it opens the hiring wizard pre-filled, so you always see and approve the brief
before a machine is created and before you are billed.

> **Not available yet — and everything above this line describes the design, not a screen you
> can use.** The gallery page is built and the menu item works, but the API it reads
> (`GET /api/templates`) does not exist in this build at all. The page therefore always lands
> on its error frame — control bar and filters drawn, no cards, a "couldn't load" message. It
> is not an intermittent failure and there is nothing to retry. Until the API ships, hire from
> a role (section 3); the built-in roles come with a solid starting brief.

---

## 6. Letting the AI write the first draft

On step 2 of the hiring wizard, both the **Instructions** and the **Rules & boundaries**
boxes have an **✦ AUTO-GENERATE** button. Press it and a draft appears, written for the role
you picked, in your interface language, taking account of the agent name and first tasks you
have already typed. Editing the text afterwards is normal and expected — the draft is a
starting point, not an answer.

If the AI writing service is unavailable or errors, the button quietly falls back to that
role's stock brief rather than showing you an error. If the text you get looks generic and
does not mention anything you typed, that is what happened.

> **On a Manager-supplied role, the fallback is empty.** Only ArkAgent's own eight roles carry
> stock brief and rules text. Roles that come from the runtime service (section 3, step 1)
> carry none, so if the AI writing service is not configured, pressing AUTO-GENERATE on one of
> them leaves the box blank rather than filling it. That is not a bug you can fix — write the
> brief yourself.

**Why you should still read and edit every line:**

- **It does not know your business.** It knows the role. It does not know your prices, your
  customers, your competitors, your refund window or the phrase your team never uses. Those
  are exactly the details that make a brief useful.
- **A generated rule list is a starting point, not a risk assessment.** It will produce
  sensible general rules. It cannot know that one particular client must never be emailed on
  a Friday. Run the six questions in section 4.4 against the draft and add what is missing.
- **You are the one accountable for what it does.** If you would not sign the brief, do not
  launch it.
- **Vagueness survives generation.** If the draft says "handle enquiries appropriately", that
  sentence will do nothing. Replace it with a number, a name or a step.

A good working rhythm: generate, then delete a third of it, then add the five specifics only
you know.

> **Not available yet — "Describe it instead →".** On step 1 of the hiring wizard there is a
> banner offering to draft the whole agent from a paragraph in your own words — the role, the
> rules, the schedule, all of it. The screen behind that button opens and you can type into
> it, but the generation API it calls does not exist in this build, so pressing generate
> always ends with the warning *"We couldn't reach the drafting service. Nothing was created,
> and your text is still here."* and a **Try again** button that will fail the same way.
> Nothing is lost and nothing is charged. Use the four-step wizard and the AUTO-GENERATE
> buttons instead.
>
> This also means the schedule editor, the context-file uploader and the review screen that
> live further inside that flow cannot be reached at all today.

---

## 7. Uploading context

Covered in full in section 4.5. In short, and to save you looking:

- **Uploading files is not available yet.** There is a file picker inside the "Describe it
  instead" flow, but that flow cannot be completed at all today (section 6), so no agent in
  this build has ever received an uploaded document.
- **Put facts in the Instructions.** That is the route that works — the Instructions and the
  Rules are the only two things ArkAgent sends to the agent's machine.
- **Add web addresses under Settings → Memory & knowledge → Knowledge sources.** These are
  stored against the agent; like every other setting, they are not yet transmitted.
- **Never put credentials, card numbers or ID numbers anywhere in a brief.**
- **Assume anything in the brief could be repeated to whoever the agent is talking to.**

---

## 8. Reminders and schedules

This is the part where you tell an agent *when* to act: "every weekday at 9am, check the
overnight support inbox and summarise anything unresolved."

### What is built

The scheduling engine is finished and working. It understands plain phrasing in English,
简体中文, 繁體中文 and 日本語; it handles time zones and daylight-saving changes correctly;
and it is protected against firing the same reminder twice.

Phrases it reads correctly include:

| What you would type | What it means |
|---|---|
| `every weekday at 9am` | Monday to Friday, 09:00 |
| `daily at 18:00` | Every day at 18:00 |
| `every Monday at 8:30` | Weekly |
| `weekly` | Every Monday at 09:00 |
| `every 15 minutes` | Four times an hour |
| `every 2 hours` | Twelve times a day |
| `tomorrow at 9` | A one-off |
| `monthly` | Once a month |

If you name a day but no time, 09:00 is assumed. If it cannot read the phrase confidently, it
shows you its best reading and asks you to confirm rather than guessing silently.

**"What to expect"** is a short note — up to 280 characters — that you attach to a reminder
describing what a good result looks like: *"A list of overnight tickets, or the words
'nothing new'."* It is wrapped in an `<expected-result>` block and dispatched to the agent
alongside the instruction, so the agent knows what shape of answer you want. Each run also has
a place to record whether the expectation was met — but **nothing in the product writes that
verdict yet**, so do not expect a reminder that has quietly stopped producing anything to
flag itself. That half is designed and stored for, not built.

There are sensible limits: up to 20 active reminders per agent (50 rows in total, since
switching one off is not the same as deleting it), 200 active across the whole workspace, a
default ceiling of 96 runs a day per reminder, and an absolute floor of one run every five
minutes.

### What is not built

> **Not available yet — the reminders screen.** There is no page anywhere in the product where
> you can create, edit or view a reminder. The engine runs on a per-minute tick and the API it
> reads is deployed; the screen to drive it does not exist, and the agent page's six tabs
> (section 9) contain no schedules view. Everything in this section describes behaviour that
> is ready and waiting for that screen. **In practice this means no agent has any reminders
> today**, so nothing is being scheduled for anyone.
>
> Also remember: the **Reminders & schedule** box on step 2 of the hiring wizard is not saved
> and does not create anything.

### What you can do today instead

- **Put the cadence in the Instructions.** This is the one that actually works, because the
  Instructions are pushed to the runtime. "Every Friday at 17:00, give me one page covering
  X, Y and Z" travels with the brief.
- **Set working hours and a heartbeat** in the agent's Settings (section 4.6) — but read the
  caveat there first: these are stored, not yet enforced.

> **Do not rely on the daily digest.** Settings → Escalation & notifications has a **Daily
> digest** switch (on by default, 18:00), an **escalate to** email box, and notify-on-review
> and notify-on-error switches. **ArkAgent sends no email of any kind** — there is no mail
> transport in the product, which is the same reason password reset does not work. Those four
> controls save your preference and nothing more. Check on your agents by opening them.

### How to check something actually ran

Open the agent and look at **Activity**. Events ArkAgent itself records — provisioning,
pausing, resuming, terminating, self-reviews, improvement decisions — appear there with a
timestamp. **An empty Activity tab does not prove nothing ran**, because the runtime is not
yet reporting the agent's own work back. To see the agent actually respond, use **Chat**.
Section 9 has the detail.

---

## 9. Managing an agent day to day

Open **Fleet**, then any agent. You get six tabs.

### Activity

A list of what the agent has done, newest first: a time on the left, the text in the middle,
and a colour-coded tag on the right. There are fourteen tags — meeting, draft, research,
review, outreach, learning, resolved, escalated, summary, published, brief, calendar, docs and
system. This is where you check whether something ran. With nothing logged it reads *"No
activity yet — this agent hasn't logged anything."*

> **What to expect on launch day.** ArkAgent writes activity itself for the things it does:
> provisioning an agent's machine (or the reason it could not), pausing, resuming and
> terminating, running a self-review, and approving or dismissing an improvement. Those appear
> immediately. What is missing is the record of the agent's *own* work — every run, every
> step, every health check. ArkAgent has the endpoint the runtime posts that to; the runtime
> service does not post it yet. **An empty or sparse Activity tab is the normal, current
> experience, not a fault.** Chat and self-review are the two places where you can see the
> agent actually working today.

### Tasks

The queue: everything you added as a first task, plus anything queued since. Each task shows
its state — done ✓, in progress ◌, blocked !, or queued · — and any task that has a stored
result carries a **VIEW RESULT** button, which opens the result in a dialog rather than
navigating away. A task with no stored result has no button, whatever its state. For OpenClaw
agents the list shown here is the runtime's own task list, not ArkAgent's copy — and your
brief is itself sent to the machine as a hidden first task, which this tab deliberately does
not display.

### Chat

Talk to your agent directly. See section 10.

### Performance

Two halves.

**Self-review** — press **Run self-review** and a language model reads the agent's last 25
activity entries and its recorded metrics and proposes specific improvements. Each suggestion
sits in the **Improvement queue** with an **Approve** or **Dismiss** button. This needs a
language-model key on the deployment; without one the button returns a 503 (troubleshooting
13). And because the Activity tab is sparse today, the review has little of the agent's real
work to read — expect general suggestions, not forensic ones.

**The agent never changes its own rules.** That part is true and load-bearing: nothing
anywhere lets an agent edit its own brief.

> **Approving does not apply anything.** The footnote on this card reads "Approved changes
> apply at the next self-review cycle." Approving marks the suggestion approved and logs the
> decision to Activity; **no code applies the change to the agent.** If you agree with a
> suggestion, act on it yourself in Settings → Behavior. Treat the queue as a reading list
> with a tick box, not a workflow.

### Usage

Token usage for this agent over today, the last 3 days, 7 days or 30 days, broken down into
input, output, cache and total, with a chart and a call count. Useful for spotting an agent
that has quietly become expensive.

*(This tab reports for OpenClaw agents. On other engines it will say token usage is not
available.)*

### Settings

Everything about the agent, grouped into cards: Identity, Behavior, Autonomy & approvals,
Schedule, Model & reasoning, Skills & tools, Learning loop, Memory & knowledge, Channels,
Escalation & notifications, and Limits.

**Identity** holds the agent's name, its role (shown but not editable), its **engine** and its
**plan**. **Adjusting the brief** is done in Behavior → **Instructions** and **Rules &
boundaries**. Press **Save changes**. ArkAgent pushes the new brief to the runtime service and
bumps the agent's config revision — no restart, no downtime, no re-hiring. If the push fails
it is retried by reconciliation rather than reported to you, so give a brief change a few
minutes before concluding it did not land.

> **The engine picker offers more than you can actually run.** Identity → ENGINE lists four
> runtimes — OpenClaw, Hermes, **Codex Harness** and **DeepSeek Harness**. Only the first two
> can be provisioned: the runtime service has never been given an identifier for Codex or
> DeepSeek. They exist in the data model, they appear in this one picker, and choosing one
> does not move your agent onto it. Stay on OpenClaw or Hermes.

At the bottom of Settings you will find the lifecycle controls:

| Action | What happens |
|---|---|
| **Pause agent** | ArkAgent asks the runtime to stop the machine and marks the agent paused. Memory and state are kept. Resume any time. |
| **Resume agent** | The machine is started again and the agent goes back to working. |
| **Terminate agent** | The machine is stopped and the agent is marked terminated. The on-screen note says it and its machine are archived after 30 days — that retention is the runtime service's policy, not something ArkAgent performs. |
| **Delete agent** | Terminates first, then permanently deletes the agent and releases its billing seat. You are asked to confirm. **Deleting also removes that seat's included credits from your workspace allowance.** |

Pause, resume and terminate record the intended state locally even if the runtime cannot be
reached, so an outage can never leave you unable to stop an agent from this screen.

**When to pause rather than terminate:** a quiet season, a campaign that has ended, a brief
you are rewriting, or an agent that is behaving in a way you do not understand. Pausing is
free of consequences and completely reversible. Reach for it first.

### "Needs review"

**NEEDS REVIEW** is one of the states an agent can be in. It means the agent has stopped and
is waiting on you — a decision it is not allowed to make alone, an approval your rules
require, or something it flagged as beyond its remit.

Your **Overview** shows a **NEEDS YOUR REVIEW** count. That number combines agents sitting in
the needs-review state with improvement suggestions waiting in any agent's Performance tab.
When it is not zero, something is waiting for a human — you.

The states you will see on a card:

| State | Meaning |
|---|---|
| **DRAFT** | Exists in the data model but nothing creates one — every hire starts at PROVISIONING. You will not see this. |
| **PROVISIONING / DEPLOYING** | Its machine is being built |
| **WORKING** | Running |
| **SCHEDULED** | Waiting for its next scheduled moment |
| **NEEDS REVIEW** | Waiting on you |
| **PAUSED** | Stopped by you, state kept |
| **ERROR** | Something failed — the reason is in Activity |
| **TERMINATED** | Stopped and archived |

---

## 10. Talking to your agent, and connecting messaging channels

### The web console

Open any agent and choose **Chat**. Type, press Send. The web console is attached to every
agent automatically, marked connected from the moment the agent is created, and cannot be
switched off.

Who answers depends on what the deployment has: if the agent has a live OpenClaw machine you
are talking to the live agent; if it does not but a language-model key is configured, a model
answers in its place; if it has neither, a production deployment returns **"No agent runtime
or language model is configured for this deployment."** rather than pretending. The session
picker above the transcript lists earlier conversations, but it is fed by the OpenClaw runtime
— on a Hermes agent, or an OpenClaw agent whose machine is not reachable, it will be empty.

This is the fastest way to test a brief. Ask it to summarise its own job. Ask it what it would
do about a specific awkward customer. Ask it what it is not allowed to do. You will find the
holes in your brief in about four minutes.

Every message you send in the web console uses **one credit**, recorded when the exchange
finishes — including when it fails. There is no per-message charge for the reply itself.

### Connecting a messaging channel

In an agent's **Settings**, in the **Channels** card, you can connect it to:

**飞书 (Feishu)** · **钉钉 (DingTalk)** · **微信 (WeChat)** · **企微 (WeCom)**

Each one is a card with a switch and a **configure** panel:

- **Feishu** — App ID and App Secret. (The direct-message and group-message policy pickers are
  written but commented out of the build, so this panel asks for two values, not four.)
- **DingTalk** — Client ID, Client Secret, Corp ID and Agent ID. (Robot Code, message type and
  the allow-list are likewise present in the source but commented out.)
- **WeChat** — press **Scan to Login** to generate a QR code, then scan it with WeChat.
- **WeCom** — Bot ID and Secret.

You get these credentials from the platform's own admin console. If you do not know where to
find them, whoever administers your company's Feishu, DingTalk or WeCom account does.

> **Telegram, WhatsApp, LINE, Slack and Email — offered, but not reachable.** These five
> appear on step 3 of the hiring wizard and are recorded against your workspace as *pending*.
> A setup screen for them does exist in the build, at `/dashboard/channels`, with credential
> forms for all six; **its menu row is commented out, so nothing in the product links to it**
> and you would have to type the address to find it. Treat these five as not connectable. The
> four in the agent's own Settings — Feishu, DingTalk, WeChat, WeCom — are the ones with a
> supported path.

---

## 11. Plans, credits and billing

### The plans

Three plans, priced per agent, per month. Annual billing is charged up front at **20% off**.

| Plan | Monthly (USD) | Monthly (CNY) | Credits included each month |
|---|---|---|---|
| **Associate** | $49 | ¥349 | 5,000 |
| **Professional** | $149 | ¥1,068 | 25,000 |
| **Director** | $399 | ¥2,868 | 100,000 |

Annual, paid up front:

| Plan | Annual (USD) | Annual (CNY) |
|---|---|---|
| **Associate** | $470.40 | ¥3,350.40 |
| **Professional** | $1,430.40 | ¥10,252.80 |
| **Director** | $3,830.40 | ¥27,532.80 |

What each plan advertises — these are the exact feature lines the plans carry, not a
reconstruction:

| Plan | Feature lines |
|---|---|
| **Associate** | 5,000 credits included monthly · 1 messaging channel · Weekly self-review · OpenClaw engine |
| **Professional** | 25,000 credits included monthly · All channels — Telegram to WeChat · Daily self-review + persistent memory · Both engines + auto-match · Priority compute |
| **Director** | 100,000 credits included monthly · Dedicated VM resources · OPC mode — one agent, many hats · Audit log & approval workflows · White-glove onboarding |

Note that Director's list says nothing about channels, self-review frequency or engines. Do
not assume it inherits Professional's — nothing in ArkAgent enforces or documents that.

The CNY prices are a local price ladder set for the China market, not a currency conversion of
the dollar prices. As noted in section 1, there is no currency control inside the dashboard:
the displayed currency follows your interface language unless you pin one on the public
pricing page or the Payment screen.

The plan is set **per agent**, not per workspace — an Associate support agent and a Director
operator can sit side by side in the same fleet, and the estimate is the sum of the seats,
counting every agent that has not been terminated. The hiring wizard picks the cheapest plan
the role allows; you can change any agent's plan later in its **Settings → Identity → PLAN**.

**A seat is created the moment you hire, paid or not.** Hiring is not gated on payment: the
agent is provisioned, a monthly seat is recorded, its included credits are added to your
allowance, and the seat starts appearing on the estimate. Buying through **Payment** is a
separate act. If you hire and never pay, you will see an estimate you have not settled rather
than a blocked agent.

> **Changing a plan afterwards moves the price but not the allowance.** Your workspace's
> included credits are added when an agent is hired and removed when one is deleted; switching
> an existing agent from Associate to Director changes what the estimate charges for that seat
> and leaves the included-credit total where it was. Until that is reconciled, treat the
> allowance in the sidebar as "what you were granted at hire", not "what your current plans
> add up to".

> **A note on plan features.** What your bill is based on is the tier's **price** and its
> **included credits** — those two numbers are real and the code uses them. The rest of the
> feature list is marketing copy that nothing in ArkAgent enforces: no screen checks your tier
> before letting you connect a second channel, pick an engine or run a self-review. Whether
> those differences are honoured is a question for the runtime service. Do not read a missing
> lock icon as "this is included on my plan"; if a capability matters commercially to you,
> confirm it before you buy.

### Credits

A **credit** is the unit of work. You spend them two ways:

- **Every message you send in the web console costs 1 credit.** This is the only credit ArkAgent
  charges itself, and it is recorded whether or not the reply succeeded.
- **Compute your agent uses while working** is designed to be reported back by the runtime
  service and charged in credits. **The runtime is not reporting it yet**, so today your credit
  line is your chat volume and nothing else.

Your plan includes an allowance each cycle — the sum of the included credits of every agent
seat you hold, which is why a workspace with no agents shows an allowance of zero. Past the
allowance, **overage** is quoted at **$2 per 1,000 credits** or **¥14 per 1,000 credits**.

> **What "billed" means today.** That overage figure appears on the **estimated invoice** on
> the Billing & usage page. Nothing in ArkAgent turns it into a charge: the only thing that
> writes a real invoice is a checkout you complete yourself. So going over your allowance
> today produces a larger estimate, not a larger bill, and nothing stops working in the web
> console. The one place the allowance does bite is the reminder scheduler, which refuses to
> fire a due run once a workspace has used up its included credits — and since there is no way
> to create a reminder yet (section 8), that has no effect on anyone.

To cap it: each agent has a **Monthly credit cap** in Settings → Limits. `0` means "use the
plan allowance".

> **The cap does not pause the agent.** The hint under the field says "Agent pauses if
> exceeded"; it does not. The only code that reads this number is the reminder scheduler's
> pre-flight check, which skips that agent's due scheduled run and leaves the agent running.
> It does not stop web chat, and it does not change the agent's status. With no reminders
> possible today, setting a cap currently has no observable effect at all.

### Paying

**Payment** in the menu opens checkout. Pick monthly or annual, then hand off to the payment
provider:

| Currency | Provider |
|---|---|
| USD | Stripe |
| CNY | Alipay |

The Stripe route sends you to Stripe's own hosted Checkout page. The CNY route goes through a
payment gateway that in turn hands you to Alipay.

**ArkAgent never sees or stores your card details.** Both routes end on a page hosted by the
payment provider, and that is where you enter payment details — never on an ArkAgent screen.
If a page inside ArkAgent ever asks you to type a card number, do not.

If the deployment has no credentials for the provider your currency needs, checkout refuses up
front with **"This payment method is not available right now."** No order is left half-made and
nothing is charged.

After you pay you land on a confirmation screen that waits for the provider to confirm.
Payment is confirmed by the provider notifying ArkAgent, not by your browser returning — so if
your connection drops on the way back, your payment is still fine. The screen tells you
whether it succeeded, is still pending, was cancelled, or failed.

> **Note.** The checkout screen currently sells the **Professional** plan. Associate and
> Director appear on the pricing page and are used to price agents, but cannot be purchased
> through checkout yet.

### Billing & usage

**Billing & usage** in the menu shows, for **this cycle**, **last cycle**, **the last 90
days** or a **custom range**:

- credits used against your included allowance,
- an estimated invoice — agent seats, overage, annual discount, total,
- per-agent usage, so you can see which agent is spending,
- your invoices, with the provider that settled each one. A settled invoice is marked
  **PAID**; anything else shows its raw internal state in capitals — most often **OPEN**, for
  a zero-value cycle such as a free trial. There is no "DUE" label, despite what the interface
  copy prepares for.

Everything on this page is computed from your workspace's actual recorded usage — this is the
one screen that counts your web-console messages, so it is the number to trust when it
disagrees with the sidebar meter or the Overview tile (section 2). If it reads zero, nothing
has been used.

"This cycle" here means the calendar month so far, or the date you signed up, whichever is
later. "Last cycle" is the 30 days before that.

> **Not available yet — invoice PDFs.** Each invoice row shows a "PDF ↓" label. It is styled
> to look clickable but has no link and no handler behind it, and no document is produced. For
> a receipt today, use the one your payment provider sends you — Stripe emails one
> automatically, and Alipay keeps a record in your Alipay account.

---

## 12. Troubleshooting

**1. "I clicked Forgot password and no email arrived."**
Password reset is not implemented. The confirmation screen appears and even quotes a 30-minute
expiry, but no link is generated and no message is sent — ArkAgent has no mail transport at
all. If you are still signed in anywhere, change your password from **Personal center**. If you
are locked out, contact support; you cannot self-serve this today.

**2. "My agent's Activity tab is empty."**
Expected, for now. Reporting of the agent's own work from the runtime is not live yet. You will
see the events ArkAgent records itself — provisioning, pause, resume, terminate, self-reviews
and improvement decisions — and you can see the agent working in **Chat**. An empty Activity
tab is not a sign that your agent is broken, and it is not proof that nothing ran either.

**3. "The Templates page shows an error."**
Expected, and it will show it every time — the API behind the gallery is not in this build at
all, so there is nothing to retry. Hire from a role instead (section 3).

**4. "The Skills page is empty."**
Expected. No skill source has been loaded and nothing has been synced into the catalogue. The
skill switches inside each agent's Settings are a separate, fixed list and save normally.

**5. "I typed a reminder in the hiring wizard and nothing happens at that time."**
The Reminders & schedule box on step 2 is not saved and creates nothing; it only echoes back on
the review screen. Put the cadence in the Instructions instead — "Every Friday at 17:00, send
me…" — since that text does reach the agent. There is no reminders screen anywhere yet
(section 8).

**6. "My agent says ERROR right after I hired it."**
The machine could not be provisioned. Open the agent and read **Activity** — the reason is
recorded there. This is usually a service-side problem, not something in your brief. Try
hiring again; if it repeats, contact support with the agent name and the message from Activity.

**7. "I can't find Telegram / WhatsApp / Slack / Email anywhere."**
They are offered as a preference during hiring but cannot be connected yet. Only Feishu,
DingTalk, WeChat and WeCom have working setup, inside each agent's Settings → Channels.

**8. "The agent did something I didn't want."**
This is a brief problem, almost always. Do three things, in order: **Pause** it; open Settings
→ Behavior and add the missing sentence to **Rules & boundaries** as a NEVER with a number in
it; then Resume. The Rules text is one of the two things that actually reaches the machine, so
this is the fix that works. Setting **Autonomy** to "Ask first" and switching on **Approve
external sends** expresses the same intent, but see troubleshooting 15 before relying on them.

**9. "The agent keeps asking me to approve everything."**
The opposite problem, and today it is a brief problem too: your Instructions or Rules are
telling it to check in. Loosen the wording. The **Autonomy**, **Approve external sends** and
**Approval over** controls in Settings → Autonomy & approvals record your preference but are
not yet sent to the runtime, so changing them alone will not quieten an agent down.

**10. "I paid and my plan hasn't changed."**
Payment is confirmed by the provider notifying ArkAgent, which can take a moment and does not
depend on your browser. The return screen polls and will tell you when it settles. If it still
shows pending after several minutes, check **Billing & usage → Invoices** — if the invoice is
there, you are paid. If it is not there after an hour, contact support with the order number
from the return screen.

**11. "I clicked 'Describe it instead' and it says it couldn't reach the drafting service."**
Expected — that flow is not connected in this build (section 6), and **Try again** will fail
the same way. Go back and use the four-step wizard. Your text is not lost and you have not
been charged.

**12. "Two agents are doing the same work / my agent's brief is a mess."**
You have given one agent more than one job, or two agents overlapping ones. Split them.
One job per agent, one brief per job.

**13. "Self-review says it needs an LLM."**
The exact message is *"Self-review needs an LLM. Set OPENROUTER_API_KEY to enable it."* The
feature needs a language-model key configured on the deployment, and this one does not have
it. Nothing on your side can fix this — ask whoever administers your deployment. The same key
is what makes Chat answer when an agent has no live machine, so if self-review is refusing,
expect Chat to be limited too.

**14. "I switched on Daily digest / typed an escalation email and nothing arrives."**
Expected. ArkAgent has no mail transport at all — no digest, no escalation email, no
notification of any kind is ever sent, and the same gap is why password reset does not work.
Those switches record a preference. Check on your agents by opening them.

**15. "I changed a setting and the agent behaves exactly as before."**
Only two fields in the whole Settings screen are transmitted to the runtime today:
**Instructions** and **Rules & boundaries**. Autonomy, approval thresholds, daily limits,
skills, local-execution tools, working hours, heartbeat and credit caps are stored on
ArkAgent and are waiting on the runtime team. If a constraint matters, write it into the Rules
in words as well — see section 4.4.

**16. "My credit cap is set and the agent kept spending."**
The cap does not pause an agent. The only thing that reads it is the reminder scheduler, and
reminders cannot be created yet. Nothing about the cap affects web chat. See section 11.

---

## 13. Glossary

**Agent** — one AI worker. It has a name, a role, a brief, rules, skills and its own machine.

**Agent Manager** — the outside service that actually runs your agents' machines. ArkAgent
hires, briefs and supervises; the Agent Manager runs.

**Autonomy** — how much your agent does without asking. Suggest, Ask or Auto.

**Brief** — the Instructions plus the Rules & boundaries. The job description.

**Channel** — a place your agent talks to people: the web console, Feishu, DingTalk, WeChat,
WeCom.

**Context** — what the agent knows about your business, over and above its instructions.

**Credit** — the unit of work you are billed in. One web-console message is one credit, charged
whether or not the reply succeeds. Compute is reported in credits by the runtime service, which
is not reporting yet — so today your credit line is essentially your chat volume.

**Cycle** — your billing period. Monthly or annual.

**Engine** — the runtime an agent runs on: OpenClaw (open, widest skill set) or Hermes
(precision, guardrails, audit trail). Auto-match takes the default engine attached to the role
you picked; it does not read your brief. Two further engines, Codex and DeepSeek, appear in
the Settings picker but cannot be provisioned.

**Fleet** — all the agents in your workspace.

**Heartbeat** — how often an agent wakes to check for work: every 5, 15 or 30 minutes, or
hourly.

**Improvement** — a change an agent proposes to how it works, waiting for you to approve or
dismiss. Agents never change their own rules — and today, neither does approving: the decision
is recorded, not applied.

**Needs review** — the agent has stopped and is waiting on a human decision.

**Overage** — the rate quoted past your included credit allowance: $2 or ¥14 per 1,000
credits. It appears on the estimated invoice; nothing charges it automatically today.

**Plan** — Associate, Professional or Director. Priced per agent, per month.

**Role** — the job title. The list is supplied by the runtime service when it is reachable and
falls back to ArkAgent's own eight (Sales Prospector, Customer Support, Legal Reviewer and so
on) when it is not. For those eight it sets the starting brief and the minimum plan; roles that
come from the runtime service carry neither.

**Rules & boundaries** — the hard limits the agent must never cross.

**Self-review** — an agent reading back over its own recent work and proposing improvements.

**Skill** — a capability an agent is allowed to use: web research, email, calendar, invoicing
and so on. Fourteen of them, as a fixed list inside each agent's Settings. The separate
**Skills** page in the menu is a catalogue of published skills and is empty in this build.

**Template** — a complete pre-written agent, ready to review and hire. Not live yet — the
gallery page loads and always errors, because the API behind it does not exist here.

**Terminate** — stop an agent and mark it terminated. The interface says it and its machine are
archived after 30 days; that retention is the runtime service's, not ArkAgent's. Distinct from
**Pause**, which keeps everything and is reversible, and from **Delete**, which is permanent
and releases the billing seat.

**Web console** — the Chat tab. Present on every agent. Whether it can answer depends on the
agent having a live machine or the deployment having a language-model key.

**Workspace** — your company's container: your agents, credits, invoices and billing.

---

*This guide describes ArkAgent as it stands today, checked against the code rather than the
roadmap. Everything marked **Not available yet** is under construction; nothing marked that way
is a fault on your side. Where the interface's own wording promises more than the code does —
the Auto-match card, the credit-cap hint, the self-review footnote, the digest switch — this
guide says so rather than repeating it.*
