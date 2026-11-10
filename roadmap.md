# Travel CRM — roadmap

## Done

### The redesign (this round)

- [x] **New home page** — an ordered list of what needs you today, in plain
      sentences, built from real records. Charts moved to `/insights`.
- [x] **Plain language layer** (`src/lib/crm/language.ts`) — every module
      name, status and stat label now speaks like a person, not like a
      database. Includes a "what does this status mean / what do I do next"
      guide for every status.
- [x] **Redesigned shell** — a collapsible sidebar in five short groups
      (Selling, Trips, Working, Money, Tools) with "What needs you" pinned
      to the top, a slim top bar, and a command palette that finds records,
      tasks, people and actions.
- [x] **Redesigned sign-in** — one centred card, plain copy, a one-click
      demo, and three lines explaining what the product does.
- [x] **Six-zone page template** (`src/components/crm/page.tsx`) — identity,
      switchboard, work, context, next, footer. Every page uses it.
- [x] **Archetype layouts** — ledger (dense table with column picker and real
      page sizes), pipeline (stage board with pre-filled stage, semantic
      colours and a keyboard stage bar), catalogue (card grid).
- [x] **Trimmed views** — 216 near-identical tabs cut to a handful of
      meaningful views per module.
- [x] **Guided first record** (`src/components/crm/firstrun.tsx`) — an empty
      workspace walks you through making your first record, one question at
      a time, with a live preview.
- [x] **Journey rail** (`src/lib/crm/journey.ts`) — enquiry → quote → visa →
      flight → hotel → transfer → departure → invoice, on one line, with each
      step a real record you can open.
- [x] **Redesigned tasks page** — "My day" first, grouped Late / Today /
      Tomorrow / Later, with the calendar one click away.
- [x] **Help panel** — the `?` key explains the screen you are on, in three
      lines, with no manual.

### Truth and safety

- [x] **No fabricated metrics** — customer health is built from real
      payments, recency, trips and open tasks; margin comes from the
      recorded supplier cost and shows "—" when unknown; one rule for
      customer segments.
- [x] **Branch scoping** — branch-scoped roles only see their own branch,
      enforced on every record query, export, bulk action and single read.
- [x] **One request on sign-in** — `GET /workspace/all-records` replaced
      twenty-four round trips; the rate limit no longer trips on a reload.
- [x] **429 retry with backoff** — a busy server never leaves a blank screen.
- [x] **Connected seed data** — ten real traveller journeys (enquiry →
      quote → trip → visa → flight → hotel → transfer → invoice → support),
      so every cross-module view has content.

### Kept working

- [x] Records CRUD, tasks, attachments, audit log, custom fields, branches,
      members, roles, API keys, billing, assistant, shared inbox, reports,
      workflows, integrations and webhooks.
- [x] Multi-currency, CSV export, board drag-and-drop, calendar
      drag-and-drop, ⌘K palette, keyboard shortcuts.
- [x] **142 tests pass · 0 lint errors · 0 TypeScript errors.**

### Money and recovery (this round)

- [x] **Recycle bin** — Settings → Recycle bin lists everything deleted with
      its module, restores in one click, and deletes for good only after a
      second click. Deleting now says "moved to the recycle bin" and offers
      **Undo** in the toast.
- [x] **Hotel rate plans** — a `HotelRate` master (room type, meal plan,
      season, validity, cost, selling price, cancellation) on Hotels → Rate
      plans, with the margin shown while you type.
- [x] **TCS under 206C(1G)** — an organisation rate in Tax settings, an
      override per invoice, a separate line on the tax invoice, and TCS
      reported apart from GST in the working paper.
- [x] **Report exports** — real `.xlsx` (summary, every breakdown, records)
      and a printable PDF, from the same filters the screen is showing.
- [x] **One GST rule** — the amount stored on an invoice is what the customer
      pays, tax included; the PDF carves the tax back out instead of adding it
      twice, so the invoice and the Tax & GST paper agree to the rupee.
- [x] **Audit-ready invoice numbers** — `HT-INV-26-27-0001`, one unbroken
      series per financial year, derived from the highest number already
      issued so a deleted invoice never hands its number to the next one.
- [x] **Versioned migrations** — a baseline `prisma/migrations/0_init` and
      `db:migrate` / `db:baseline` / `db:drift` scripts, so production schema
      changes no longer rely on `db push`.
- [x] **Webhook delivery log** — Integrations → Connection logs shows every
      attempt with the response code, the payload, and a "Send again" button.
- [x] **Campaign sender** — Marketing → Campaigns: write the message, choose
      the audience (records + statuses), see who is in it before sending, then
      send on email or WhatsApp. Runs in the background with a progress bar,
      counts opt-outs out loud, and keeps a per-recipient delivery log.
      `{{name}}`, `{{reference}}` and `{{destination}}` fill themselves in.

## Next

- [ ] Saved views per person (personal + shared), stored server-side
- [ ] Favourites for individual records, not just pages
- [ ] Scheduled campaigns (pick a date and time instead of sending now)
- [ ] Real customer directory refresh (the health score is honest now, but
      the "interaction history" join still needs the relation table)
- [ ] `RecordRelation` model so links are explicit rather than inferred
- [ ] Quotation PDF with letterhead (print stylesheet)
- [ ] Offline mode and a service worker
- [ ] Accessibility audit against WCAG AA with a real screen reader
- [ ] A11y pass on the board (keyboard drag-and-drop)

## Later

- [ ] GDS / supplier connectors
- [ ] GST e-invoicing
- [ ] Payment links
