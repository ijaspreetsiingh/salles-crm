# Traveldesk — Complete Redesign & Rebuild Plan (A → Z)

> **Status: implemented.** The plan below was executed. What shipped, what was
> deliberately changed and what is still open are all tracked in
> [`roadmap.md`](./roadmap.md). This file stays as the design brief.

> **Goal:** A travel CRM that a real travel agency can run on. Every page is self-explanatory
> (nobody should need training), every module feels purpose-built (not a renamed table),
> and the backend is refitted to serve exactly what the UI needs.
>
> **Repos touched:** `src/` (frontend), `backend/` (API), `design/` (reference only, not shipped).

---

## 0. What I found (audit summary — read this first)

### 0.1 Two design languages are fighting each other

| | `design/` (Rapport reference) | `src/` (shipping app) | Verdict |
|---|---|---|---|
| Canvas | `#ebe8e1` warm greige | `#fdfbf7` near-white | `design/` warmer, less "SaaS-white" |
| Pine | `#2f5c50` deep teal | `#30a46c` bright green | `design/` far more premium |
| Butter | `#f2c94c` saturated | `#e6b980` beige | `design/` |
| Card radius | 26px | 32px | `design/` tighter |
| Shadow | warm-tinted, deep | neutral, shallow | `design/` |
| CSS approach | Tailwind utilities + 8 semantic classes | 3,936-line hand-written CSS (~500 selectors) | `src/` is more verbose but **safer** |
| Data | bespoke TS types, no API | `RecordRow` + 24 module schemas + REST client + tests | `src/` is the real product |

**Decision:** Ship the **`design/` visual language** (palette, radius, shadow, component vocabulary)
on top of the **`src/` engineering** (schema engine, API layer, store, tests).
**Critical:** `design/` has a broken Tailwind bridge — 104 usages of `bg-well`, `bg-glass-2`,
`border-rim`, `bg-float`, `bg-solid`, `text-muted` reference `--color-*` tokens that were never
declared, so **those classes emit zero CSS**. Worse, `--color-muted: var(--well)` makes every
secondary label 6%-opacity black (invisible). We take the palette, **not** the broken token wiring.

### 0.2 The product shape

- **24 modules** (leads → settings), one generic `RecordRow` entity, one REST engine
  (`/workspace/:module/records`) for all of them.
- **9 modules have bespoke JSX** inside a 2,920-line `workspace.tsx` (assistant, inbox, reports,
  integrations, itinerary, automation, settings, flights, growth).
- **Backend is genuinely complete**: Express + Prisma/SQLite + JWT + RBAC + audit + 20 route
  groups, pagination envelope `{ items, meta: { page, pageSize, total, totalPages } }`.
- **Tests:** 17 across 4 files. Lint/TS clean.

### 0.3 The 12 real problems (this is the "boring" you're feeling)

| # | Problem | Evidence | Severity |
|---|---|---|---|
| P1 | **20 of 24 modules are the same table with different column labels** | `workspace.tsx` renders one `<table className="data-table workspace-table">` for every non-special module | 🔴 Critical |
| P2 | **Fabricated metrics presented as fact** | customer health = hash of the name; gross margin = hard-coded `rev * 0.24`; "segment" defined twice with conflicting rules | 🔴 Critical |
| P3 | **Dead buttons** | dock *Favorites* and *Call* have no `onClick`; *Connection logs* is a permanent `EmptyState`; *Save draft* / *Save preferences* are toast-only; Reports' 6 cards all render identical bars | 🔴 Critical |
| P4 | **Navigation is a guessing game** | 8 dropdown pills in a scrolling header + a 6-icon floating dock; 24 modules, no sidebar, no tree, no favourites | 🟠 High |
| P5 | **216 near-identical pages** | catalogue tabs (finance 9, settings 11, agents 7, reports 9…) mostly just filter the same table | 🟠 High |
| P6 | **Hints are in Hinglish inside an English product** | `"Naya enquiry aaya? Create lead → stage New rakho."` | 🟠 High |
| P7 | **Data doesn't connect across modules** | seed data uses different names per module → cross-module joins are empty; `Interaction History` matches on exact name equality → always empty | 🟠 High |
| P8 | **Real bugs** | Notes duplicate on every save; pagination hard-coded to **6**; view state leaks across tabs; board can write statuses that don't exist in the schema; KPI recomputes when you type in search; search ignores email/phone/owner | 🟠 High |
| P9 | **Backend under-used by the UI** | `/workspace/:module/facets` and `/workspace/:module/stats` exist but the client never calls them (it computes client-side); `/dashboard/counters` unused; `/reports/:report` returns 4 breakdowns, UI uses 1 | 🟠 High |
| P10 | **No security scoping** | `branch_manager` sees every branch's records — `membership.branchId` is never applied to queries | 🔴 Critical |
| P11 | **~40 dead CSS classes**, dead exports (`extraKeyName`, `statusOptions`, `isExtraKey`, `formatMoney`), dead `.kanban-*` family | `styles.css` | 🟡 Medium |
| P12 | **No onboarding, no saved views, no favourites, no relations** | nothing teaches a new user; nothing remembers how you left a page | 🟠 High |

### 0.4 What is real and must survive the redesign

Records CRUD · tasks · attachments (upload/download/delete) · audit trail · custom fields ·
org/branches/members · assistant chat · shared inbox + templates · reports + saved reports ·
workflows + runs · integrations + webhooks + test delivery · billing/subscription/usage ·
role matrix · API keys · profile + password · multi-currency · ⌘K · board drag-drop · calendar
drag-drop · CSV export.

---

## 1. The plan in one page

```
┌─ FOUNDATION ─────────────────────────────────────────────────────────┐
│ 1. Design tokens rebuilt (design/ palette + fixed bridges)            │
│ 2. Primitives kit (Panel, Segmented, Chip, Avatar, Ring, Sheet, …)   │
│ 3. Page template: 6 zones, identical on all 24 pages                 │
└───────────────────────────────────────────────────────────────────────┘
┌─ NAVIGATION ─────────────────────────────────────────────────────────┐
│ 4. Collapsible sidebar (grouped tree, counts, favourites, recents)   │
│ 5. Command palette v2 (records + tasks + people + ACTIONS + fuzzy)   │
│ 6. Top bar: search, branch, notifications, theme, profile            │
└───────────────────────────────────────────────────────────────────────┘
┌─ WORKSPACE ENGINE ───────────────────────────────────────────────────┐
│ 7. 9 view archetypes (Pipeline, Ledger, Calendar, Inbox, Catalogue,  │
│    Canvas, Report, Console, Checklist)                               │
│ 8. Saved views, column control, real server pagination               │
│ 9. 24 modules re-cast to archetypes (table in §5)                    │
└───────────────────────────────────────────────────────────────────────┘
┌─ RECORD 360 ─────────────────────────────────────────────────────────┐
│ 10. Record detail = hero + journey rail + timeline + tabs + actions  │
│ 11. Cross-module relations (lead→quote→booking→invoice→visa)        │
└───────────────────────────────────────────────────────────────────────┘
┌─ BACKEND v2 ─────────────────────────────────────────────────────────┐
│ 12. New models: Relation, RecordEvent, SavedView, Favorite, Pref    │
│ 13. Branch scoping + real margin + facets/stats used for real        │
│ 14. Search v2, aggregate endpoint, PDF, task board, audit scoping    │
│ 15. Seed v2: realistic, cross-linked, 4 months of history            │
└───────────────────────────────────────────────────────────────────────┘
┌─ TRUST ──────────────────────────────────────────────────────────────┐
│ 16. Onboarding: first-run tour, smart empty states, ?-help panel     │
│ 17. A11y, perf, offline, undo, keyboard                              │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 2. Foundation — design system (Section A)

### 2.1 Tokens (final values)

Adopt `design/`'s palette, with **contrast-corrected** values so it passes WCAG AA.

**Light**
```css
--bg:        #ebe8e1;   /* warm greige canvas            */
--text:      #17191a;   /* soft black                    */
--muted:     #5f625d;   /* was #676a66 → 6.4:1 on --bg    */
--faint:     #7e8179;   /* was #8e918c → 3.2:1 (AA large) */
--glass:     rgba(255,255,255,.46);
--glass-2:   rgba(255,255,255,.65);
--glass-3:   rgba(255,255,255,.85);
--solid:     #f6f4ef;
--float:     #fdfcf9;
--well:      rgba(23,25,26,.06);
--line:      rgba(23,25,26,.09);
--line-2:    rgba(23,25,26,.16);
--rim:       rgba(255,255,255,.78);
--pine:      #2f5c50;  --on-pine:    #fbf8f2;
--butter:    #f2c94c;  --on-butter:  #17191a;
--tomato:    #c8431f;  --on-tomato:  #fbf8f2;
--ink:       #17191a;  --on-ink:     #fbf8f2;
--r-card: 26px; --r-tile: 22px; --r-ctl: 999px;
--ease: cubic-bezier(.2,.8,.2,1);
```

**Dark** (pine is **lightened** — `#2f5c50` on `#111412` is only 3.2:1 and unusable as text)
```css
--bg: #111412; --text: #f1eee8; --muted: #a3a6a0; --faint: #85887f;
--glass: rgba(255,255,255,.05); --glass-2: rgba(255,255,255,.09); --glass-3: #222624;
--solid: #1c201e; --float: #242927;
--pine: #5fa392;  /* AA on dark      */
--butter: #f2c94c; --tomato: #d8532d;
```

### 2.2 Fix the broken Tailwind bridge (mandatory)

```css
@theme inline {
  /* existing shadcn set stays */
  --color-muted: var(--muted);            /* FIX: was var(--well) → invisible text */
  --color-muted-foreground: var(--muted);
  /* brand aliases */
  --color-ink: var(--ink);       --color-ink-foreground: var(--on-ink);
  --color-forest: var(--pine);   --color-forest-foreground: var(--on-pine);
  --color-ember: var(--tomato);  --color-ember-foreground: var(--on-tomato);
  --color-sun: var(--butter);    --color-sun-foreground: var(--on-butter);
  --color-surface: var(--solid); --color-track: var(--line);
  /* NEW — the tokens design/ was missing */
  --color-well: var(--well);     --color-glass: var(--glass);
  --color-glass-2: var(--glass-2); --color-glass-3: var(--glass-3);
  --color-rim: var(--rim);      --color-float: var(--float);
  --color-solid: var(--solid);  --color-pill: var(--pill);
  --color-line: var(--line);    --color-line-2: var(--line-2);
  --color-bg: var(--bg);
  --radius-3xl: 40px;
}
```
Plus **keep** `src/styles.css`'s hand-written `.bg-well / .bg-glass-2 / .border-rim / …` helpers
(they are the safety net) and **delete** the ~40 dead selectors listed in P11.

### 2.3 Type scale (new)

| Token | Size / leading | Use |
|---|---|---|
| `display` | 34 / 1.04, `-0.02em` | Overview page title (2-line Rapport style) |
| `h1` | 26 / 1.2 | Every other page title |
| `h2` | 18 / 1.3 | Panel titles |
| `h3` | 15 / 1.35 | Card titles |
| `body` | 14 / 1.5, weight 500 | Default |
| `small` | 13 / 1.45 | Secondary |
| `micro` | 11.5 / 1, `.08em` uppercase | Eyebrows, column caps |
| `num` | `font-variant-numeric: tabular-nums` | **All money, counts, dates** |

Fonts: `Urbanist` (UI) + `JetBrains Mono` (references, PNR, amounts in tables) — already loaded.

### 2.4 Primitive kit (`src/components/crm/ui.tsx`)

Port from `design/src/components/crm/ui.tsx` and normalise onto `src/styles.css`:

`Panel` · `PanelHead` · `IconBtn` · `MoreBtn` · `OpenBtn` · `Avatar` (real initials, 4 tints) ·
`AvatarStack` · `Segmented` · `Chip` · `PrimaryBtn` · `SecondaryBtn` · `GhostBtn` ·
`Ring` (SVG progress donut) · `Meter` (linear bar) · `StatTile` · `EmptyState` · `Skeleton` ·
`Sheet` (right slide-over) · `Modal` (centered, scrim) · `Tabs` · `Tooltip` · `Field` (label+input+error+hint) ·
`Select` · `SearchInput` · `DateRange` · `Kbd` · `Toast` (sonner, themed).

Every primitive gets: focus-visible ring, hover state, disabled state, loading state,
empty state, and a **motion** transition of 150–220ms on `--ease`.

### 2.5 Layout grid & density

- 12-column grid, 16px gutter, page gutter `clamp(16px, 1.6vw, 28px)`, max width 1600px.
- **Density toggle** (Comfortable / Compact) persisted per user → row height 56px vs 40px.
- 3 elevation levels: `flat` (well) · `raised` (glass-card) · `floating` (pop / sheet).
- Responsive: sidebar → sheet < 1024px, tables → card lists < 768px, KPI grid 4→2→1.

---

## 3. The Page Template (Section B) — "learn one page, know all 24"

**Every single page** in the app uses this exact 6-zone skeleton. This is the core of
"no learning needed" — a user learns the *shape* once and every module feels familiar.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ZONE 1 — IDENTITY                                                       │
│  eyebrow (group) · page title · one-line purpose ("what is this for")   │
│  + 3–4 live StatTiles (value, delta, click-through)                     │
│  + Primary action button (verb + object: "Create quotation")            │
├─────────────────────────────────────────────────────────────────────────┤
│ ZONE 2 — SWITCHBOARD  (view switcher · saved views · filters · search)  │
│  [Board|List]  [ My view ▾ ]  [Status ▾][Date ▾][Owner ▾]  🔍  ⤓      │
├─────────────────────────────────────────────────────────────────────────┤
│ ZONE 3 — THE WORK  (the archetype-specific main view)                   │
│  Pipeline board / Ledger table / Calendar / Catalogue / Canvas / …      │
├─────────────────────────────────────────────────────────────────────────┤
│ ZONE 4 — CONTEXT  (right or below: the record's "why" + what changed)   │
│  Record preview · Activity timeline · Related records · Notes          │
├─────────────────────────────────────────────────────────────────────────┤
│ ZONE 5 — NEXT  (what needs me: overdue, unassigned, due today)          │
├─────────────────────────────────────────────────────────────────────────┤
│ ZONE 6 — FOOTER  (counts, pagination, last synced, keyboard hint)      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Rules that make it self-explanatory:**
- Zone 1 always has a **one-line purpose** written in plain language, e.g.
  *"Every enquiry from first message to confirmed journey."*
- Every number is **clickable** and drills into the filtered set that produced it.
  (KPI tile = a link with the query params already applied.) — this kills "so what is this number?"
- Every status chip is **hoverable** → tooltip: *"Qualified — send the quotation to move forward."*
- Every record's **name is clickable** (today only the reference code opens it).
- Every button reads as **verb + object**, never "New" or "OK".

---

## 4. Navigation (Section C)

### 4.1 Collapsible sidebar (replaces the 8 dropdown pills + floating dock)

```
┌────────────────────────────┐
│ ◉ traveldesk.   ⌘K        │   ← brand + inline global search
├────────────────────────────┤
│ ★ Favourites                │   ← pinned records + modules
│ ⏱ Recent                    │   ← last 6 visited
├────────────────────────────┤
│ SALES & CRM            ⌄   │
│   Leads & enquiries    12  │   ← live counts (red dot if >0 "needs action")
│   Customers             8  │
│   Quotations            4  │
│   …                        │
│ BOOKINGS & TRIPS        ⌄   │
│ OPERATIONS             ⌄   │
│ B2B NETWORK            ⌄   │
│ FINANCE                ⌄   │
│ AI & AUTOMATION        ⌄   │
│ REPORTS                ⌄   │
│ ADMINISTRATION         ⌄   │
├────────────────────────────┤
│ ⚙ Settings   ☾ Theme  ⎋ Out│
└────────────────────────────┘
```

- 248px expanded / 64px icon rail on collapse. Toggle persists per user.
- Groups expand/collapse; the active group auto-expands.
- Counts come from a **single** `GET /dashboard/counters` + per-module pending counts.
- **Keyboard**: `g` then `l` (leads), `g` then `b` (bookings), `g` then `f` (finance)…
  `Ctrl/Cmd+K` palette · `/` search · `n` new record · `?` shortcuts.
- **Mobile**: sidebar becomes a left sheet; the header keeps a search + menu button.

### 4.2 Command palette v2 — "Go to anything"

Current palette only searches records + module names. New palette has **5 groups**:

| Group | Example query | Result |
|---|---|---|
| **Go to** | `fin` | Finance workspace |
| **Records** | `Aarav` | Lead LD-2401 · status · owner |
| **Tasks** | `visa` | Task "Verify visa documents" · due |
| **People** | `priya` | Member Priya Nair · role · branch |
| **Actions** | `>new` | New lead / New booking / New invoice / Export / Log a call |

- Fuzzy match, keyboard-first (↑↓⏎), "Type **>** for actions" hint, recent items biased to the top.
- Backend: `GET /search?q=` extended to cover tasks, conversations, members **and** return a
  `type` discriminator (see §9.4). Actions are local (frontend) + remote (dynamic).

### 4.3 Top bar

Brand · **visible** global search input (not hidden behind ⌘K) · branch switcher (with
branch-scoped permissions) · notification bell with unread badge · theme toggle · profile menu
(Profile, Preferences, Keyboard shortcuts, Sign out). The old `Notifications` / `Favourites` /
`Call` dock buttons become **real**: bell → notification centre page, star → favourites, phone →
click-to-call panel.

---

## 5. The Workspace Engine + all 24 modules (Section D)

### 5.1 Nine archetypes

| # | Archetype | Layout | Interaction |
|---|---|---|---|
| A1 | **Pipeline** | horizontal stage columns, drag-drop | drag card between stages, card opens Record 360, stage bar in drawer |
| A2 | **Ledger** | dense sortable table + column picker | row click → drawer, inline status edit, bulk actions, sticky header |
| A3 | **Schedule** | day/week/month calendar + agenda rail | drag to reschedule, click day → agenda, conflict warnings |
| A4 | **Catalogue** | responsive card grid | card = rich preview, filters as chips, quick actions on hover |
| A5 | **Inbox** | 3-pane (list · thread · context) | thread reply, templates, assign, link to record |
| A6 | **Canvas** | full-bleed editor (itinerary, workflow, report) | live preview side-by-side, autosave, publish/export |
| A7 | **Queue** | SLA-timed list, priority sorted | claim, escalate, snooze, one-click resolution |
| A8 | **Console** | settings-style grouped panels | form panels, live validation, test-connection action |
| A9 | **Report** | chart canvas + insight rail | range toggle, drill-down, save view, export |

### 5.2 Archetype assignment (24 modules)

| Module | Archetype | Primary action | What makes it *not* a table |
|---|---|---|---|
| **Leads & enquiries** | A1 Pipeline | Create enquiry | Funnel rail with live stage values + conversion; Follow-ups tab = task lane; Sources tab = attribution |
| **Customers** | A4 Catalogue | Add customer | Real health score (recency + open bookings + payment + activity), LTV from real invoices, Customer 360 page |
| **Quotations** | A2 Ledger + A6 Canvas | Create quotation | Validity countdown, live margin per row, "Convert to booking" one click, print/PDF letterhead |
| **Companies & corporate** | A2 Ledger | Add company | Policy & cost-centre chips, traveller request flow, approval chain |
| **Communications** | A5 Inbox | Compose | 3-pane threads, channel tabs (WhatsApp/Email/Call), templates, link to record, SLA chip |
| **Marketing** | A2 Ledger + A9 Report | New campaign | Real attribution from lead `source`, spend vs pipeline value, coupon/referral table |
| **Bookings** | A1 + **Journey 360** | Create booking | ⭐ **Journey rail** — enquiry→quote→payment→visa→flight→hotel→departure→invoice, one screen |
| **Flights & ticketing** | A3 Schedule + A2 Ledger | Search flights | Departure timeline, PNR queue with ticketing-deadline countdown, reissue/refund tracking |
| **Hotels & stays** | A4 Catalogue | Add hotel | Room-allotment grid, rate-plan ladder, voucher state per booking |
| **Packages & activities** | A4 Catalogue | New package | Seasonal rate ladder, fixed departures with fill gauge, margin per departure |
| **Ground transport** | A3 Schedule | Add transfer | Vehicle/driver roster, time-slot board, pickup chain per booking |
| **Visa & insurance** | A7 Queue + Checklist | Start application | Per-applicant document checklist, appointment timeline, expiry watch |
| **Groups & MICE** | A2 Ledger | New group | Rooming list sheet, budget vs actual bars, delegate manifest |
| **Trip operations** | A3 Schedule | Today's departures | Departure board with manifest readiness %, checklists, incidents log, POF deadlines |
| **Suppliers & contracts** | A2 Ledger | Add supplier | Contract expiry tracker, allotment vs used meters, settlement ageing |
| **Support & complaints** | A7 Queue | New ticket | SLA countdown per ticket, escalation path, refund-request linkage, KB answers |
| **B2B agent network** | A2 Ledger | Invite agent | KYC pipeline, credit-limit meter, commission statements per agent |
| **Finance & accounting** | A2 Ledger + A9 Report | Create invoice | Receivables ageing, real margin (uses `extra.cost`), GST summary, payment-match panel |
| **AI assistant** | A6 Canvas | Ask | Contextual copilot (knows the open record/page), itinerary generator, suggestion chips |
| **Workflow automation** | A6 Canvas | New workflow | Visual trigger→condition→action builder, run history, dry-run with sample data |
| **Reports & analytics** | A9 Report | Save view | 7 **distinct** report types (not 6 cards with the same bars) + insight rail |
| **Website & distribution** | A4 Catalogue | New page | Page cards, destination catalogue, product catalogue, SEO score |
| **Integrations** | A8 Console | Connect | Connection cards w/ live status, **real** webhook delivery log, test-delivery |
| **Administration** | A8 Console | Save | 5 panels (not 11 tabs): Organisation · People & Roles · Branches · Appearance · System |

### 5.3 Tab → View refactor (kills the 216-page problem)

Catalogue tabs currently act as status filters. Convert them into **saved views** that carry
*filters + sort + grouping + columns + a layout hint*, and prune the redundant ones.

| Module | Before | After |
|---|---|---|
| finance | 9 tabs | **4 views** — All invoices · Receivables · Payables · Reconciliation (ledger) + 5 saved views |
| settings | 11 tabs | **5 sections** — Organisation · People & Roles · Branches · Appearance · System |
| agents | 7 tabs | **3 views** — All agents · KYC pending · Credit & commission |
| reports | 9 tabs | **7 report types** (Sales, Bookings, Operations, Finance, B2B, Marketing, Team) |
| quotations | 4 tabs | **2 views** (Drafts · Sent) + a **Create quotation** canvas (not a tab) |
| inbox | 6 tabs | **3 views** (All · Mine · Unassigned) + channel filter (WhatsApp/Email/Call) |
| others | 4–6 tabs | keep only tabs that change *meaning*, not just a status filter |

### 5.4 The generic Ledger (A2) — feature list

Real server pagination (25/page, size picker 25/50/100) · column picker (show/hide/reorder) ·
server-side sort & filter (status, owner, branch, date range, source) · **full-text search
including email, phone, owner, notes** · saved views (personal + shared) · bulk actions
(assign, status, export, delete) with **Undo** · inline status change · row → drawer preview →
full Record 360 · sticky header + zebra-free hairline rows · density toggle ·
CSV export respecting the *current* filters · keyboard row navigation (↑↓⏎).

### 5.5 The Pipeline (A1) — feature list

Stage columns with **count + value + conversion %** in the header · drag-drop between stages ·
cards showing: name, destination, value, owner avatar, age, next task, warning icons ·
click card → right **Sheet** with a 5-stage progress bar (click to move) · inline amount/date/owner ·
stage colour **derived from stage semantics** (not index cycling) · per-column "+" that **pre-fills
the status** (today it lies) · board only on modules that declare `boardStatuses`; for the other 21
the "board" button is replaced by the module's natural second view.

---

## 6. Record 360 (Section E) — one record, every angle

Replaces the current 4-tab `RecordDialog` (Overview / Timeline / Documents / Notes).

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◀ Back      LD-2401 · Leads                       [Edit] [⋮] [★] [Delete]│
│  Aarav Sharma                          ₹1,85,000      ● New             │
│  Bali, Indonesia · 2 travellers · 14 Mar 2026                           │
├──────────────────────────────────────────────────────────────────────────┤
│ JOURNEY RAIL   ① Enquiry ─ ② Quoted ─ ③ Booked ─ ④ Travelled ─ ⑤ Invoice │  ← from real relations
├──────────────────────────────────────────────────────────────────────────┤
│ [Overview] [Activity] [Documents] [Notes] [Tasks] [Related] [Audit]      │
├──────────────────────────────────────────────────────────────────────────┤
│ OVERVIEW                                                                │
│  ┌─ Contact ────────┐  ┌─ Trip ──────────┐  ┌─ Money ────────┐          │
│  │ name  email     │  │ destination     │  │ amount cost    │          │
│  │ phone  source   │  │ travellers date │  │ margin  status │          │
│  └──────────────────┘  └─────────────────┘  └────────────────┘          │
│  NEXT ACTIONS:  [Create quotation] [Convert to booking] [Start visa app] │
│  (contextual, per module, with permission checks)                       │
├──────────────────────────────────────────────────────────────────────────┤
│ RIGHT RAIL                                                             │
│  Owner · Branch · Priority · Tags                                     │
│  Related records (real relations, not name matching)                   │
│  Open tasks · Recent activity                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Journey 360 for a booking** (the star page): a horizontal rail
`Enquiry → Quotation → Payment → Visa → Flight → Hotel → Transfer → Departure → Invoice → Post-trip`
where each step is a real related record with its own status. Steps that don't exist show a
`+ Add` affordance. One click from any node opens that record. **This single page is the most
"real CRM" artefact in the product and the biggest single win.**

---

## 7. Onboarding & "no learning needed" (Section F)

### 7.1 The empty-state library (the highest-leverage change)

Today: `"No records found — Try a different search or clear your filters."` (tells the user nothing).

New `EmptyState` template, per module:
```
[icon]  No enquiries yet
        Enquiries are every question that comes in about a trip.
        ① Create your first enquiry       ② Set it to New
        ③ It moves to Contacted once you reply
        [ Create enquiry ]   [ See an example ]
```
- Every module gets a bespoke 3-step explainer in `schema.guide` (plain English, 1 sentence per step).
- Always a **primary CTA** and always a **"See an example"** that opens a read-only demo record.
- Filter-empty vs genuinely-empty are **different** components (filter-empty offers "Clear filters").

### 7.2 The ? help panel

A right-hand panel, opened from any page's `?` button or `⌘/`, that explains **the screen you are on**:
what it is for, the 3-step flow, the 3 most common actions, and links to the relevant module.
Content comes from `schema.guide` — one source of truth, so it can never go stale.

### 7.3 First-run tour

3 steps max (Sidebar → Create a record → Move it through stages), skippable, re-playable from
Help, shown only once per user, and **stored server-side** in `Preference`.

### 7.4 Ambient guidance (replaces the Hinglish tips banner)

- Tips become **English, contextual and conditional**: only show when the module has data that
  suggests the user needs it (e.g. "3 leads have been sitting in New for 5+ days — review them?").
- Every tip is a **link to a filtered view**, not a sentence of advice.
- One tip at a time, dismissible, persisted.

### 7.5 Micro-copy rules

| Instead of | Use |
|---|---|
| "New record" | "Create enquiry" / "Create invoice" |
| "Delete" | "Delete enquiry" (+ what is lost) |
| "Nothing needs attention. Nice." | "You're all caught up. Next departure is in 2 days." |
| "No records found" | (see 7.1) |
| "Save & close" (lies) | "Done" (and actually save) |

---

## 8. Tasks, Calendar, Notifications (Section G)

- **Tasks** → A3 Schedule archetype: `My day` (default) · `Team` · `Calendar` · `Completed`.
  Left rail = today's agenda grouped by overdue/today/tomorrow. Month grid keeps drag-drop.
  Task row shows a **real** derived status (Overdue / Due today / High) — not a fake `Status` chip.
  Bulk: assign, reschedule, complete, delete + Undo.
  `My tasks` must filter by the **signed-in user's** name (today it uses seeded employee names → empty).
- **Notifications** → a real notification centre route (`/notifications`) with tabs
  *All · Mentions · Assigned · System*, grouped by day, with per-item "snooze" and
  "mark all read", and a **"why am I seeing this"** explanation. Derived items (overdue invoice,
  stalled lead, departure tomorrow) link to the filtered view that produced them.
- **Calendar** (global) → month/week toggle, 3 colour-coded tracks (Departures · Deadlines · Meetings).

---

## 9. Backend v2 (Section H) — refitted to the UI

### 9.1 New Prisma models

```prisma
model RecordRelation {          // NEW — the backbone of Record 360
  id             String   @id @default(cuid())
  organizationId String
  fromId         String
  toId           String
  kind           String   // quoted | booked | invoiced | visa_for | paying_for | escalated_to
  createdAt      DateTime @default(now())
  @@unique([fromId, toId, kind])
  @@index([organizationId, fromId])
  @@index([organizationId, toId])
}

model RecordEvent {             // NEW — real activity feed + comments
  id             String   @id @default(cuid())
  organizationId String
  recordId       String
  actorId        String?
  actorName      String   @default("System")
  type           String   // note | call | email | whatsapp | status_change | field_change | payment
  body           String   @default("")
  meta           String   @default("{}")
  createdAt      DateTime @default(now())
  @@index([organizationId, recordId, createdAt])
}

model SavedView {               // NEW — saved views + shared filters
  id             String   @id @default(cuid())
  organizationId String
  userId         String?
  moduleId       String
  title          String
  filters        String   @default("{}")
  sort           String   @default("{}")
  columns        String   @default("[]")
  grouping       String   @default("")
  isDefault      Boolean  @default(false)
  isShared       Boolean  @default(false)
  createdAt      DateTime @default(now())
  @@unique([organizationId, moduleId, title])
}

model Favorite {                // NEW — kills the dead "Favourites" button
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  targetType     String   // record | module
  targetId       String
  createdAt      DateTime @default(now())
  @@unique([userId, targetType, targetId])
}

model Preference {              // NEW — per-user UI prefs
  id             String   @id @default(cuid())
  organizationId String
  userId         String
  key            String
  value          String   @default("")
  @@unique([organizationId, userId, key])
}
```
`Preference` keys: `theme`, `density`, `sidebarCollapsed`, `defaultBranch`, `defaultLanding`,
`tourCompleted`, `favouriteViews`, `currency`.

### 9.2 Security fix (P10) — branch scoping

`buildRecordWhere()` must intersect the caller's access:
- `company_admin` / `sales` / `support` → all branches of the org.
- `branch_manager` / `operations` → **only `membership.branchId`** (plus records with no branch).
- `finance` → all branches but finance-visible modules only.
Applied to **every** record query: list, facets, stats, csv, bulk, search, dashboard, reports, notifications.
Same for tasks, conversations, audit.

### 9.3 Real metrics (P2) — stop fabricating

| Metric | Today | Fix |
|---|---|---|
| Gross margin | `revenue * 0.24` hard-coded | `amount - cost` where `extra.cost` exists; else `null` (show "—", never a guess) |
| Customer health | hash of the name | real composite: recency (last activity) + open bookings + payment status + ticket history |
| Customer segment | two conflicting definitions | one rule, stored on the record (`extra.segment`), amount used only as the fallback |
| Win rate | derived from two regexes | `Won / (Won + Lost)` from leads, per period |
| Lead source attribution | `source` field only | join source → lead → booking → invoice for real revenue per source |
| "Top customers" | lifetime value from bookings | real lifetime = sum of **paid** invoices |

### 9.4 New / upgraded endpoints

| Endpoint | Purpose | Notes |
|---|---|---|
| `GET /workspace/:module/records` | list | **add**: `q` (search email/phone/owner/notes), `ownerId`, `mine`, `starred`, `columns`, `groupBy`, `pageSize` up to 100 |
| `GET /workspace/:module/facets` | filter values | **use it** — drives the filter dropdowns instead of client-side `Set` |
| `GET /workspace/:module/stats` | header KPIs | **use it** — replace client-side KPI math; extend with sparkline + top-list |
| `GET /workspace/:module/overview` | **NEW** | one call returning `{ kpis, breakdown, series, top, attention, emptyStateHint }` per module |
| `GET /workspace/:module/records/:id/related` | **NEW** | related records via `RecordRelation` + rollups |
| `GET /records/:id/timeline` | **NEW** | merged `AuditLog` + `RecordEvent` + status changes |
| `POST /records/:id/relations` | **NEW** | link two records (lead→quote→booking→invoice) |
| `GET /saved-views` · POST · PATCH · DELETE | **NEW** | saved views CRUD |
| `GET /favorites` · POST · DELETE | **NEW** | favourites CRUD (records + modules) |
| `GET/PATCH /preferences` | **NEW** | per-user UI prefs |
| `GET /search?q=&types=` | v2 | returns `{ type, id, title, subtitle, moduleId, score }` across records/tasks/conversations/members; **SQLite FTS5** |
| `GET /dashboard/overview` | upgrade | real margin, real win rate, per-branch, per-period, plus `counters` |
| `GET /reports/:report` | upgrade | use **all 5** breakdowns (`byDestination, byOwner, byStatus, bySource, byMonth`) + real margin; add `compare` (vs previous period) |
| `GET /quotes/:id/pdf` | **NEW** | print/PDF letterhead (server-rendered HTML → print) |
| `GET /tasks?from&to` | upgrade | range query for the calendar; `PATCH /tasks/bulk` for bulk actions |
| `GET /audit` | upgrade | scope by branch for non-admins; add `entityType/entityId` |
| `GET /notifications` | upgrade | add `kind`, `why` (explanation), `snoozedUntil`, bulk read |
| `GET /integrations/webhooks/:id/deliveries` | upgrade | **real** connection logs (currently a permanent empty state) |
| `GET /organizations/current/usage` | upgrade | fix the `value` vs `quantity` field-name mismatch |

### 9.5 RBAC refinements

- `requireRole` is a hard allow-list of one key → add `requirePermission(module, action)` and use it
  for org/branches/members/roles so a `branch_manager` with the right permission can act.
- `finance` role currently cannot see `finance` reports it *should* see → align `ROLE_DEFS` with
  the module list (the `reports` module is allowed but `finance` reports are not separately gated).
- Add `sales` role → `companies` module (currently missing from `ROLE_DEFS.sales.modules`).

### 9.6 Seed v2 — realistic and connected

Current seed uses different names per module → all cross-module views are empty. New seed:
- **4 customers** with a full chain each: enquiry → quotation → booking → invoice (+ partial payment)
  → visa application → flight → hotel → transfer → tasks → messages → attachments → audit entries.
- **8 more customers** at earlier stages, so funnels look real.
- Realistic dates spread over the **last 120 days and next 60 days** (departures in the future).
- 3 branches, 9 members across 5 roles, supplier contracts, 6 workflows, 3 webhooks, saved views,
  favourites, preferences.
- 3 incomplete workflows to show empty/edge states honestly.

### 9.7 Backend non-negotiables
- Structured logs with `requestId`; 429-aware client retry with jitter.
- Cursor pagination for lists > 1,000.
- Soft-delete everywhere (already), with a "Bin" in settings to restore.
- CSV export must respect the exact filters used on screen (it does) and cap at 5,000 (documented).
- All mutations audited with actor, ip, user-agent, before/after diff.

---

## 10. Frontend architecture changes (Section I)

### 10.1 New file layout

```
src/
  components/
    ui/                     # 52 shadcn primitives (keep, restyle tokens)
    crm/
      ui.tsx                # NEW  primitive kit (§2.4)
      shell.tsx             # REWRITE  sidebar + topbar + palette
      page.tsx              # NEW  the 6-zone PageTemplate
      panels.tsx            # NEW  Panel, StatTile, JourneyRail, ActivityFeed, …
      charts.tsx            # NEW  hand-rolled SVG charts (from design/) + Recharts wrappers
      archetypes/
        pipeline.tsx        # NEW  A1
        ledger.tsx          # NEW  A2
        schedule.tsx        # NEW  A3
        catalogue.tsx       # NEW  A4
        inbox.tsx           # NEW  A5
        canvas.tsx          # NEW  A6
        queue.tsx           # NEW  A7
        console.tsx         # NEW  A8
        report.tsx          # NEW  A9
      record360.tsx         # NEW  record detail
      journey.tsx           # NEW  journey rail
      modules/              # NEW  one file per module's bespoke parts
        assistant.tsx  inbox.tsx  reports.tsx  integrations.tsx
        settings.tsx   automation.tsx  itinerary.tsx  flights.tsx
      dashboard.tsx         # REWRITE
      tasks.tsx             # REWRITE
      common.tsx            # SHRINK  (Status, Avatar, CellValue only)
  lib/
    crm/
      catalog.ts            # module ids, groups, purposes
      schema.ts             # REWRITE: per-module archetype + guide + views + fields
      store.tsx             # REWRITE: server-first, no demo fallbacks in prod
      views.ts              # NEW  saved-view state + URL sync
    api/                    # + new endpoint wrappers
  routes/
    __root.tsx              # shell + providers
    index.tsx               # overview
    workspace.$module.tsx   # the archetype router
    tasks.tsx
    notifications.tsx       # NEW
    customers.$id.tsx       # NEW  Customer 360
    bookings.$id.tsx        # NEW  Journey 360
    settings.$section.tsx   # NEW  admin sections
    404 / error
```

### 10.2 State & data
- **Server-first.** The store keeps only session/org/UI prefs in memory; records come from
  per-module queries with React Query (`useQuery` per module, cached, invalidated on mutation).
- **URL is the source of truth for view state**: `?view=&status=&owner=&from=&to=&q=&sort=&page=`
  → every filtered list is shareable, bookmarkable, and back/forward works. (Today none of it is.)
- **Optimistic updates + Undo** for create/update/delete/bulk (toast with an Undo action).
- **Form autosave** (drafts) for long forms (itinerary, quotation, company).
- Offline: a service worker caching the shell + last-read records, with an offline banner.

### 10.3 Form engine
- **Smart fields**: a field can declare `showIf: (values) => boolean` → the form reshapes itself
  (e.g. trip type = *Business* → show cost centre + approval policy; *Leisure* → hide them).
- **Inline validation** on blur, never on keystroke, with the error next to the field.
- **Duplicate warning** on create: "A similar lead exists (Aarav Sharma, Bali, created 3 days ago)."
- **Command-friendly**: `⌘/Enter` saves, `Esc` cancels, `Tab` moves through fields in visual order.
- **Prefill from context**: creating a booking from a lead copies contact + trip + value.

---

## 11. Quality bar (Section J)

| Area | Target |
|---|---|
| Accessibility | WCAG 2.1 AA: contrast ≥ 4.5:1 body / 3:1 large; full keyboard nav; visible focus rings; `aria-*` on the new primitives; focus trap in dialogs & sheets; screen-reader announcements on toasts & drag-drop |
| Motion | 150–220ms on `--ease`; `prefers-reduced-motion` honoured everywhere; drag-drop has a keyboard alternative (stage bar) |
| Performance | LCP < 2s; table virtualised > 200 rows; charts ≤ 60fps; route-level code split; images none (text-first by design) |
| Responsive | 360 / 768 / 1024 / 1440 — sidebar→sheet, ledger→card list, calendar→agenda |
| i18n-ready | all strings via one `copy.ts` module (no hard-coded English in JSX) — enables the Hindi voice later without a rewrite |
| Copy | no Hinglish in an English product; no fake metrics; no buttons that lie |
| Tests | keep the 17 existing; **add ~45**: archetype per module, command palette, saved views, journey 360, branch scoping, empty states, keyboard nav, a11y smoke |
| Lint | `eslint` 0 errors, `tsc` 0 errors, prettier clean |

---

## 12. Implementation order (Section K) — 8 sprints

| Sprint | Scope | Deliverable | Gate |
|---|---|---|---|
| **S0** | Tokens, `@theme` fix, dead CSS purge, primitive kit, copy module | New design system compiles; all existing pages still render | 17 tests green, lint clean |
| **S1** | Sidebar, top bar, command palette v2, notification centre, favourites | Navigation is a tree, not a guessing game | Keyboard nav complete |
| **S2** | Page template (6 zones), archetype engine, Ledger v2 (server pagination, column picker, saved views, URL state) | One page (Leads) fully migrated as the reference | Screenshot parity review |
| **S3** | Backend v2 models + endpoints (§9.1–9.4) + branch scoping + seed v2 | Real data, real metrics | Seed v2 loads, scoping tests pass |
| **S4** | Migrate all 24 modules to archetypes; prune tabs → views | No two modules feel alike; no 216-page sprawl | Per-module checklist sign-off |
| **S5** | Record 360 + Journey rail + relations + timeline + tasks | The "wow" page | Lead→Invoice chain works end to end |
| **S6** | Empty states, ? help panel, first-run tour, contextual tips | Zero learning curve | Copy review pass |
| **S7** | A11y, perf, responsive, offline, undo, i18n extraction, new tests | Production-grade | WCAG AA audit clean |

**Sprints 0–2 are the "look & feel" deliverable. Sprints 3–5 are the "real product" deliverable.
Sprints 6–7 are the "trust" deliverable.**

---

## 13. Acceptance checklist (A → Z)

**Design**
- [ ] One token source; no ad-hoc hex values in components
- [ ] Every colour pair ≥ 4.5:1 (body) / 3:1 (large)
- [ ] `text-muted` is legible (the `--color-muted` bug is fixed)
- [ ] Two identical-looking modules do not exist
- [ ] Every page follows the same 6 zones
- [ ] No metric is fabricated; unknowns render "—"

**Navigation**
- [ ] Every one of the 24 modules is reachable in ≤ 2 clicks
- [ ] Every module is reachable in ≤ 2 keystrokes
- [ ] Command palette finds records, tasks, people, and actions
- [ ] Favourites, Call, Notifications, Export all actually work
- [ ] Active section is always visible (no guessing)

**Onboarding**
- [ ] No page has an unexplained empty state
- [ ] Every page has a one-line purpose
- [ ] Every number is clickable to its source
- [ ] Every status explains itself on hover
- [ ] The `?` panel explains every page
- [ ] First-run tour is skippable and replayable

**Data & backend**
- [ ] No hard-coded percentages, no hash-based scores
- [ ] Branch scoping enforced server-side on every query
- [ ] Pagination is server-side with a size picker
- [ ] Search covers email, phone, owner, notes
- [ ] Every record type can be linked to every other
- [ ] Audit trail is complete and readable
- [ ] Seed data tells a coherent business story

**Quality**
- [ ] Keyboard-only journey: sign in → create a lead → quote → book → invoice → mark paid
- [ ] Screen reader announces page title, zone changes, toasts, drag results
- [ ] 360px wide: nothing overflows, nothing is unusable
- [ ] 45 new tests + 17 existing pass
- [ ] `eslint` 0 · `tsc` 0 · `prettier` clean

---

## 14. Explicit non-goals

- No image generation, no media pipeline, no stock-photo library — text-first by design.
- No payments processing, no supplier bookings, no GDS/GST integrations in this phase
  (the UI must never imply a real money movement).
- `design/` is a **reference**, not a second app — it is not merged, not deployed, and not
  maintained. It stays as a visual reference; its palette is copied, its broken Tailwind bridge is not.
- No third-party chart library beyond Recharts (already installed) + the hand-rolled SVG charts.

---

## Appendix — File-by-file change map

| File | Action | Notes |
|---|---|---|
| `src/styles.css` | REWRITE | design/ palette, contrast fixes, full `@theme` bridge, delete dead CSS |
| `src/components/crm/ui.tsx` | NEW | primitive kit |
| `src/components/crm/page.tsx` | NEW | 6-zone template |
| `src/components/crm/shell.tsx` | REWRITE | sidebar + topbar + palette v2 |
| `src/components/crm/dashboard.tsx` | REWRITE | zone-based, real KPIs |
| `src/components/crm/workspace.tsx` | SPLIT → archetypes/ | 2,920 lines → ~6 focused files |
| `src/components/crm/common.tsx` | SHRINK | keep Status/Avatar/CellValue |
| `src/components/crm/pipeline-board.tsx` | → archetypes/pipeline.tsx | fix status prefill, semantic colours |
| `src/components/crm/customer-directory.tsx` | → archetypes/catalogue.tsx | real health, no double switcher |
| `src/components/crm/growth-reports.tsx` | → archetypes/report.tsx | real breakdowns |
| `src/components/crm/tasks.tsx` | REWRITE | My-day first |
| `src/components/crm/record360.tsx` | NEW | record detail |
| `src/components/crm/journey.tsx` | NEW | journey rail |
| `src/lib/crm/schema.ts` | REWRITE | + archetype, guide, views, showIf |
| `src/lib/crm/catalog.ts` | EDIT | purposes, groups, one segment rule |
| `src/lib/crm/store.tsx` | REWRITE | server-first, prefs, favourites |
| `src/lib/api/*` | EDIT | new endpoint wrappers |
| `src/routes/*` | EDIT/NEW | notifications, customers/$id, bookings/$id, settings/$section |
| `src/copy.ts` | NEW | every string |
| `backend/prisma/schema.prisma` | EDIT | + 5 models, + indexes |
| `backend/src/services/records.ts` | EDIT | branch scoping, q search, columns |
| `backend/src/services/analytics.ts` | EDIT | real margin, win rate, health |
| `backend/src/modules/*.routes.ts` | EDIT/NEW | §9.4 endpoints |
| `backend/src/domain/rbac.ts` | EDIT | role/permission alignment |
| `backend/src/db/seed-data.ts` | REWRITE | seed v2, connected chains |
| `backend/tests/api.test.ts` | EDIT | + scoping & endpoint tests |
