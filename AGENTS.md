<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up
> in the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## The one idea

**A person should never have to learn this software.** They should be able to
open it, read the top of the screen, and know what to press.

Three rules follow from that, and they decide every design argument:

1. **Lead with the work, not the charts.** The home page is an ordered list of
   the things that need doing, in plain sentences. Numbers live on a second
   page that you reach only when you want them.
2. **Say it the way a person would say it.** "Leads & enquiries" is "Enquiries".
   "Receivables" is "Money owed to you". Every visible string goes through
   `src/lib/crm/language.ts`.
3. **Never show a number you cannot back up.** If no supplier cost is on
   record, margin is unknown and the UI says "—". A hash of a customer's name
   is not a health score.

## Frontend architecture

- **The six-zone page.** Every page in the app is built from
  `src/components/crm/page.tsx`: identity → switchboard → work → context →
  next → footer. Learn one page, know all of them.
- **Plain language only.** `plain()` and `plainModule()` in
  `src/lib/crm/language.ts` are the only way to render a module name, a
  status or a stat label. Add new words there, never inline.
- **The worklist is the home page.** `src/lib/crm/worklist.ts` turns real
  records into plain sentences ("Chase payment for Priya Mehta — ₹92,000 ·
  payment is late"). It never invents anything.
- **Archetypes, not one table.** `src/components/crm/archetypes/` holds the
  layouts (ledger, pipeline, catalogue). A module picks one; no two modules
  should feel the same.
- **Empty means guided.** When a workspace has no records, the first-run
  wizard (`src/components/crm/firstrun.tsx`) walks the person through making
  their first one, one question at a time.
- **Explain, never assert.** Statuses carry a meaning and a next step
  (`statusGuide`), and every record shows its journey
  (`src/lib/crm/journey.ts`).

## Backend architecture

- **Branch scoping is not optional.** `applyBranchScope` in
  `backend/src/services/records.ts` narrows every record query to the
  caller's branch for branch-scoped roles. Keep it applied to lists, facets,
  stats, exports, bulk actions and single-record reads.
- **The whole workspace loads in one request.** `GET /workspace/all-records`
  replaced twenty-four round trips on sign-in.
- **Real numbers only.** Margin comes from the recorded supplier cost
  (`extra.cost`), never a percentage. If it is unknown, it is `null`.
- **Seed data is a story.** `backend/src/db/seed-chains.ts` builds ten
  connected traveller journeys so cross-module views have content. Run
  `npm run seed -- --reset` to rebuild it.

## Rules of thumb

- If a label would confuse a new joiner on their first day, it is wrong.
- If a number cannot be traced to a record, it does not ship.
- If a button does nothing, it does not ship.
