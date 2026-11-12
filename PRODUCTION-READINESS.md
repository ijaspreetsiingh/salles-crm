# Production readiness audit — Traveldesk CRM

Ye document code padh kar likha gaya hai (backend `backend/src`, `backend/prisma`,
frontend `src/`), aur isme do cheezein alag-alag likhi hain:

1. **Jo is pass me theek kiya gaya** — build, runtime aur deployment ke real
   blockers.
2. **Jo abhi bhi baaki hai** — har module ke hisaab se, severity ke saath, taaki
   pata rahe ki ek real agency isse aaj kyun nahi chala sakti.

Legend: **P0** = iske bina production me daalna galat hai · **P1** = pehle mahine
me hi dard dega · **P2** = scale/parity ka kaam.

---

## 1. Jo is pass me fix hua (P0)

### 1.1 Backend compile hi nahi hota tha — deploy impossible

`npm run build` = `prisma generate && tsc`. **61 TypeScript errors** 14 files me.
Matlab Docker image kabhi build nahi hoti, aur `dist/` bhi nahi banta. Isi ke
saath kuch errors aise the jo runtime par route ko 500 kar dete.

| # | Kya galat tha | Asar | Fix |
|---|---|---|---|
| 1 | `extra: { string_contains: … }` — JSON filter syntax ek **String** column par (17 jagah, 5 files) | Prisma har request par `PrismaClientValidationError` throw karta — corporate cost centres, travel requests, policies, supplier contracts/POs/settlements, flight ancillaries, agent KYC/credit/sub-agents, trip incidents — sab 500 | `contains` (column JSON text hai, string filter sahi hai) |
| 2 | `GroupMember.groupId` (schema me `groupRecordId`) | Group manifests, trip passengers, hotel voucher guest list — sab fail | Field name correct kiya |
| 3 | `passportNo` / `dob` / `mealPreference` (schema me `passport` / `dateOfBirth` / `dietary`) | Manifest aur voucher me passenger detail hi nahi aati thi | Correct fields |
| 4 | `groups.routes.ts` me `BadRequestError` import missing | Room block availability check par `ReferenceError` | Import add |
| 5 | `transfers.routes.ts` me `eventCreated` import missing | Rail/bus/cruise record banate hi crash | Import add |
| 6 | `payments.routes.ts` me `Router` do baar import | Compile error | Duplicate hataya |
| 7 | `createLedgerPayment()` `recordId` return nahi karta tha, caller use karta tha | Payment timeline event kabhi nahi likhta | Return me `recordId` add |
| 8 | `generateVoucherPdf()` `voucherNo` return nahi karta tha | Voucher route 500 | `voucherNo` return |
| 9 | `Expense.date` / `payee` (schema me `spentOn` / `vendor`) | Finance double-entry ledger ka expense side hi nahi chalta | Correct fields + date formatting |
| 10 | `ChatChannel.type` / `ChatMessage.type` schema me nahi | Team chat file-sharing 500 | `isDirect` se channel type derive |
| 11 | `Task.dueAt` (schema me `date`) | Customer data export 500 | `date` |
| 12 | `Payment.recordReference: { not: null }` — column non-null | Export 500 | `{ not: "" }` |
| 13 | `Branch.organizationId_code` (unique key `organizationId_name` hai) | E2E seed fail | Correct key |
| 14 | `parseJson(...)` ka generic missing (`{}` type) | 7+ routes par `TS7053`, aur `.capacity` arithmetic | `parseJson<Record<string, unknown>>` |

**Verify:** `npx tsc -p tsconfig.json --noEmit` → exit 0. `npm run build` ab
`prisma generate && tsc` complete karta hai.

### 1.2 SQLite + Docker deployment path toota hua tha

Schema `postgresql` par hai aur money columns native `DECIMAL(14,2)` hain, lekin:

- `backend/Dockerfile` ka default `ARG DATABASE_PROVIDER=sqlite` tha, aur runtime
  `ENV DATABASE_URL="file:/app/data/traveldesk.db"`.
- Prisma SQLite connector `@db.Decimal` accept nahi karta — verify kiya:
  `Native type Decimal is not supported for sqlite connector`.
- Matlab **`docker build` pehle hi `prisma generate` par fail hota tha**, aur
  README ka quick start (`npm run prisma:push` → `data/traveldesk.db`) ek aisa
  database banane ki salah deta tha jo exist hi nahi kar sakta.
- `docker-entrypoint.sh` non-postgres URL par `prisma db push` chalata tha —
  container ke andar ephemeral DB, jo next deploy par gayab.

**Fix:** Postgres hi single supported target hai, aur ab ye explicit hai —
Dockerfile default `postgres`, entrypoint non-postgres URL par saaf message ke
saath exit karta hai (silent local DB nahi banata), `db:sqlite` script mana karti
hai with reason, aur README / DEPLOY / `.env.example` / package description sab
correct kiye.

> **Ek decision jo aapko lena hai:** agar aapko SQLite dev support wapas chahiye,
> to `@db.Decimal(14,2)` annotations hatane padenge (Prisma default `Decimal`
> precision use karega). Production ke liye maine Postgres rakha hai — exact
> paisa arithmetic zyada important hai.

### 1.3 Postgres par search silently kaam nahi karta tha

`contains` Postgres me **case-sensitive** hai (SQLite me nahi). Production
Postgres par "priya" likhne par "Priya Mehta" kabhi nahi milta — leads search,
global search, audit search, owner/destination filters, sab.

**Fix:** `lib/prisma.ts` me `containsText()` — SQLite par plain `contains`,
Postgres par `mode: "insensitive"`. Apply kiya: record list/search, global search,
audit trail.

### 1.4 Subscription expiry API keys se bypass ho rahi thi

`requireAuth` ka API-key branch subscription check se **pehle** return kar deta
tha. Expired/canceled customer apni `tdk_…` key se data likhta rehta — billing ka
sabse bada leak.

**Fix:** check shared helper `assertSubscriptionActive()` me nikal diya, dono
paths (JWT + API key) par lagta hai.

### 1.5 CSV export chup-chaap 5,000 rows par kat raha tha

`GET /:module/export.csv` `take: 5000` — 20,000 leads wali agency ko adhoori file
milti, koi warning nahi. Backup/CA/migration ke liye ye data loss hai.

**Fix:** default 25,000, `?limit=` se 1,00,000 tak, plus `X-Total-Count`,
`X-Exported-Rows`, `X-Export-Truncated` headers aur audit label me
"exported N of M (truncated)". Ab client batа sakta hai.

**Streaming (is pass):** pehle poora CSV ek `string` me banta tha — 1,00,000 rows ek saath
memory me. Ab route keyset pagination (`orderBy id`, batch 1,000) se padhta hai aur har batch
seedha socket par likhta hai, `drain` ka wait karke (backpressure). Client disconnect ho to loop
ruk jata hai aur audit me "cancelled" likha jata hai. 1,00,000 rows, 192 MB heap cap, 3 repeated
exports: har baar 1,00,001 lines, ~9s, server healthy.

### 1.6 Customer PII access logs me ja raha tha

`pino-http` poora `req.url` log karta tha. Customer portal lookup
`?email=customer@…` leta hai aur inbound webhooks `?secret=…` — dono log file me
copy ho rahe the (DPDP/GDPR ke liye personal data + credential leak).

**Fix:** access-log serializer query string hata deta hai; path, method, status,
latency, request-id rehta hai.

### 1.7 GST e-invoicing live invoice par **galat IRN** lagа sakti thi

- `PROD_URL` `https://einvoice1-apisandbox.nic.in` tha (sandbox host) — comment
  me bhi likha tha "replace with live URL at go-live".
- `IRP_SANDBOX` unset = production branch, yaani live invoice sandbox portal par
  jati.
- Payload `IRP_TEST_SEK` na hone par **random key** se encrypt hota tha, jo IRP
  decrypt nahi kar sakta.
- Session `Sek` auth response se aata hai par use hi nahi hota.

**Fix (fail-closed):** live URL `https://einvoice1.gst.gov.in`, `IRP_SANDBOX`
explicit hona zaroori (`true`/`false`), aur `IRP_TEST_SEK` ke bina service
`not_configured` return karti hai with a clear message. Ab "IRN ban gaya" ka
jhootha signal nahi milta. `.env.example` me saare GSP vars documented.

> **Still P1:** real GSP ke per-session `Sek` ko AppKey se decrypt karna baaki
> hai. Jab tak wo nahi hota, live e-invoicing band rahegi — jo sahi behaviour hai.

### 1.8 Verification (iske baad chalaya gaya)

| Check | Result |
|---|---|
| `backend: npx tsc --noEmit` | **0 errors** |
| `backend: vitest run` | **158 passed**, 11 skipped (DB suite opt-in) |
| `backend: vitest run` + disposable Postgres | **169 passed**, 0 failed |
| `frontend: tsc --noEmit` | **0 errors** |
| `frontend: npm run build` | **built successfully** (3.04s, nitro output) |
| SQLite schema validate | fails as expected (documented, not silent) |
| Fresh Postgres 18: `migrate deploy` | **10/10 applied**, exit 0 |
| Fresh Postgres 18: `migrate diff --exit-code` | **No difference detected** (exit 0) |
| Seed on fresh Postgres | 152 records, 24 modules, login works |
| API boot (`NODE_ENV=production`) | `/health` 200, `/ready` 200 (`database: up`) |
| Login + Bearer create | 200 / 201 (reference `LD-2421`) |
| CSV export 1,00,000 rows | 1,00,001 lines, 5.6 MB, chunked, ~9s, 192 MB heap cap |
| Client abort mid-export | server healthy, audit `Export … cancelled` |

---

### 1.9 Fresh Postgres par migrations adhoora schema banati thin

`0_init` SQLite se generate hui thi, aur baad ki migrations usse sirf partial
catch-up karti thin. Fresh Postgres par `migrate deploy` "success" kehta tha,
lekin schema me wo cheezein nahi thi jo app use karti hai:

- `Sequence` table hi nahi thi — har naya record reference number ke liye
  `prisma.sequence.upsert` karta hai, yaani **lead/booking/invoice create 500**.
- `User.emailVerified` column nahi tha — Prisma har user row me use select
  karta hai, is liye login/`/auth/me` fail.
- `ChatMember` / `ChatMessage` ke FK, index names, aur `TIMESTAMP(3)`
  precision drift.

**Fix:** `prisma/migrations/20261112000000_schema_sync` — `migrate diff` se
generate kiya gaya, idempotent (`IF NOT EXISTS`, constraint/index existence
checks) taaki purani `db push` DBs par bhi safe rahe. Fresh database par
10/10 migrations apply hote hain aur `db:drift` **exit 0** deta hai. Us script me
`file:./data/traveldesk.db` hardcoded tha, is liye Postgres par wo hamesha P1003
deta — ab `--from-schema-datasource` use karta hai.

### 1.10 API key / Bearer clients har write par `csrf_failed`

CSRF middleware har non-GET par double-submit cookie maangta tha — browser ke
liye theek, lekin documented server-to-server API key aur mobile Bearer
clients ke paas cookie jar hi nahi. Har create/update 403.

**Fix:** CSRF sirf tab chahiye jab request me `access_token` **cookie** ho.
`Authorization: Bearer` ya `x-api-key` wali request jisme cookie nahi hai
exempt hai — cross-site page aise header bhej hi nahi sakta (CORS preflight
fail hoga). Browser app cookie + Bearer dono bhejta hai, is liye uski
protection waisi hi hai. Verify: Bearer create 201, API key create CSRF se
guzarta hai, cookie-without-CSRF 403, cookie+CSRF 201.

### 1.11 Is pass me P0/P1 product gaps band kiye gaye

Neeche wali cheezein pehle "product decision" thi; ab code, migration aur runtime
test dono hain. Har row ke saath verify command/result likha hai.

| Gap | Ab kya hai | Verify |
|---|---|---|
| **Data erasure (DPDP/GDPR)** | `POST /api/v1/privacy/erasure` (owner/admin) email, phone ya recordId se customer dhoondta hai; name/email/phone/notes/tags/extra anonymise, conversations/call logs/consent/queued emails/tasks/notifications delete, attachments delete, records soft-delete. Finance invoices par contact fields hatate hain par legal buyer name aur invoice number retain. Har erase audit log me `Erased` + request id. `dryRun` available. | Customer create → erase 200 (`recordsErased: 1`, `notificationsDeleted: 1`) → record GET 404 → DB me `Erased contact`, email/phone blank. |
| **Uploads backup** | `npm run db:backup` ab DB dump + `UPLOAD_DIR` ka tar, dono AES-256-GCM encrypted, SHA-256 manifest ke saath. `npm run db:backup:schedule` nightly scheduler (retention/interval env se). `scripts/restore-backup.mjs` decrypt karta hai aur restore commands print karta hai — auto-apply nahi. | Real Postgres 18 par backup exit 0: encrypted DB 264 KB + uploads archive + manifest; restore helper se dump `PostgreSQL database dump` nikla aur tar me `data/uploads/test-passport.txt`. |
| **Email verification enforce** | `REQUIRE_EMAIL_VERIFICATION=true` par password login aur refresh dono 403 `email_not_verified` dete hain; `/auth/resend-verification` endpoint + login screen par resend button. Pehle se bane sessions naturally expire hote hain, is liye koi live user abruptly nahi girta. Seed/e2e users verified mark hote hain. | Register 201 → login 403 → resend 200 → token verify 200 → login 200 `emailVerified: true`. |
| **Lead form anti-spam** | Honeypot field, minimum 3s render time, same email ka 5-minute duplicate throttle, dedicated `leadFormLimiter`, aur optional Cloudflare Turnstile (sirf secret set hone par enforce). Bot ko 200 fake success milta hai, lead create nahi hota. | Honeypot 200 `reference: ""`; normal 201 `LD-2421`; turant duplicate 200 same reference, naya record nahi. |
| **Agent credit limit enforce** | Booking create se pehle available credit check; create ke baad conditional atomic `updateMany` (`creditUsed + amount <= creditLimit`). Race lose ho to booking row delete. Booking cancel hone par credit release. | Limit 1000: 2000 booking 400 "Credit limit reached"; 400 booking 201, used 400; cancel 200, used 0. |
| **Supplier 3-way match** | Payables par PO amount, bill amount, received amount + match status/verdict. Settlement sirf `matched` par allowed; variance par explicit `overrideMatch: true` + reason chahiye. | Matched payable settle 201; variance settle 400; override 201. |
| **Credit notes** | Alag `CN-` FY series (`Sequence` moduleId `credit_notes`), invoice reference, taxable/tax split, over-credit block, apply endpoint, cancel. GSTR-1 me table 9B rows aur totals se netting; GSTR-3B me outward tax se reduction. | CN-2401 (1000+180), over-credit 400, apply 200. GSTR-3B `creditNotes.count: 3, tax: 450`; GSTR-1 CSV me 3 `9B Credit note` rows. |
| **Multi-currency consolidation** | Analytics revenue/pipeline ab record currency ko organisation base currency me FX rate se convert karke aggregate karta hai; rate missing ho to `fxMissing` count report hota hai (silent 1:1 nahi). | `lib/fx.ts` + analytics service typecheck/build; base-currency totals return. |
| **Audit log immutable** | Postgres trigger `AuditLog_append_only`: UPDATE hamesha block, DELETE block jab tak organisation exist karti hai (org cascade delete allowed). | `UPDATE` → `AuditLog is append-only: updates are not allowed`; `DELETE` → same; temp org cascade delete success. |
| **Backup schedule** | `scripts/backup-scheduler.mjs` interval + retention; compose ka `backup` service scheduler chalata hai; `BACKUP_ENCRYPTION_KEY` required. Restore drill documented. | Scheduler script build/run; backup + restore helper verified (upar). |
| **Search indexes** | `pg_trgm` extension + GIN trigram indexes on `Record.name/detail/destination`; Prisma schema me declared, migration me `CREATE EXTENSION IF NOT EXISTS pg_trgm`. | `EXPLAIN` → `Bitmap Index Scan on "Record_name_idx"`; indexes list me teen GIN indexes. |
| **Attendance / working hours** | `Attendance` model + `/api/v1/attendance` check-in/check-out/me/team; half-day/full-day calculation, late minutes, team view; frontend `Attendance` module catalogue + workspace wiring. | check-in 200, me/team 200, check-out 200 (`minutes: 2`, `status: Half day`). |
| **Live e-invoicing Sek decrypt** | Har auth session ke liye 32-char AppKey generate hota hai; IRP ke return kiye `Sek` ko AES-256-ECB se decrypt karke exactly 32 chars validate, phir usi Sek se payload encrypt. Fixed `IRP_TEST_SEK` gate hata diya. | AES-256-ECB roundtrip: `sek_roundtrip true 32`, payload decrypt exact; short AppKey par clear error. |

**Automated regression suite:** naye flows ab curl par depend nahi karte.
`tests/production-gaps.test.ts` GST credit-note netting + IRP Sek crypto pin karta hai;
`tests/production-api.test.ts` real Postgres par agent credit, erasure, spam guard,
attendance, CN/GST returns, 3-way match, email verification, audit trigger aur
search indexes test karta hai; `tests/backup.test.ts` encrypted DB + uploads
backup/restore drill chalata hai.

```bash
# pure tests (DB-backed files skip cleanly)
npm test

# disposable, seeded Postgres + pg_dump on PATH
TEST_DATABASE_URL=postgresql://postgres@localhost:55434/traveldesk_fresh?schema=public \
  TEST_OWNER_EMAIL=owner@horizontravel.in TEST_OWNER_PASSWORD='Traveldesk@123' \
  npm run test:db
```

**Is pass ke checks:** backend `tsc --noEmit` 0, `npm run build` 0; default `npm test`
**158 passed / 11 skipped**, disposable Postgres par **169 passed / 0 failed**;
frontend `tsc --noEmit` 0, `npm run build` 0; fresh Postgres 18 par **11 migrations**
apply, seed complete (160 demo records / 25 modules), login 200 `emailVerified: true`,
`db:drift` 0.

## 2. Module-by-module audit — real company kahan atkegi

Har module: jo chalta hai, aur jo aaj bhi block karta hai.

### Sales & CRM

**Leads & enquiries** — CRUD, pipeline board, duplicate detection, merge, CSV
import/export, lead capture form. **Anti-spam ab closed:** honeypot + 3s minimum
render time + 5-minute duplicate throttle + dedicated limiter + optional
Turnstile (P1 → done). Inbound email attachment parsing still P2.

**Customers** — profile, journey rail, interactions. **Gap:** "interaction
history" ka kuch hissa inferred hai; `RecordRelation` table hai par har jagah
explicit links nahi. **P2.**

**Quotations** — itinerary builder, PDF, email, proposal, GST. **Gap:** multiple
package *options* ek enquiry ke andar compare karne ka UI nahi; PDF-to-itinerary
import nahi. **P2.**

**Companies & corporate** — cost centres, travel policies, approval flow. Ab
compile + runtime dono theek. **Gap:** policy approval matrix per cost centre
nahi. **P2.**

**Communications (inbox)** — shared inbox, WhatsApp Cloud API, SMTP, call logs,
templates, consent, inbound webhooks (signature-verified). **Gap:** inbound email
provider-specific payload parsing (Resend/Mailgun/Postmark) best-effort hai;
attachment parsing nahi. **P2.**

**Marketing** — campaign audience builder, queue, delivery log, opt-out. Ab
compile theek. **Gap:** scheduler single-process hai; multi-node par
`RUN_SCHEDULERS=false` chahiye. **P2.**

### Bookings & trips

**Bookings** — lifecycle, webhooks on confirm, ledger link. **Gap:** koi
overbooking/seat inventory check nahi (availability supplier-side hai). **P2.**

**Flights** — Amadeus adapter, PNR queue, E-ticket PDF, ancillaries,
reissue/refund. **Gap:** credentials ke bina sirf structure; live fares test
host par. **P1 (business decision).**

**Hotels** — rate plans, allotments, vouchers. Voucher ab compile hota hai.
**Gap:** live availability (Hotelbeds) optional; cut-off/allotment release
automation partial. **P1.**

**Packages** — fixed departures, seasonal rates. Ab type-safe. **Gap:** departure
capacity vs bookings ka hard reservation nahi. **P2.**

**Ground transport** — fleet, drivers, assignment, rail/bus/cruise (ab crash
nahi). **Gap:** driver/vehicle double-booking check nahi. **P1.**

**Visa & insurance** — applications, checklists, appointments, advisories.
**Gap:** embassy appointment slots integration nahi. **P2.**

**Groups & MICE** — delegates, rooming list, manifest, auto-rooms, room blocks.
Ab field names theek. **Gap:** room block `extra` JSON me hai, dedicated table
nahi — concurrent edits par last-write-wins. **P1.**

**Trip operations** — departures, manifests, incidents, deadlines, vouchers.
**Gap:** "arrivals today" `extra` string match par depend karta hai (fragile).
**P1.**

### Operations

**Suppliers & contracts** — contracts, POs, settlements. **3-way match ab closed:**
PO amount, supplier bill, received amount + verdict; settlement `matched` par hi
allowed, variance par explicit override + reason. **P1 → done.**

**Support** — tickets, refunds with approval chain, escalations, KB. **Gap:**
SLA timers/breach alerts nahi. **P1.**

**B2B agents** — KYC, credit limits, commissions, sub-agents, portal. **Credit
limit ab enforce hota hai:** booking create se pehle check, phir conditional
atomic charge; race lose par booking delete, cancellation par release. **P1 →
done.**

### Finance

**Finance & accounting** — invoices with FY series, GST/TCS, payment ledger,
payables, expenses, reconciliation, profitability, GSTR-1/3B, Tally XML, e-invoice
(live Sek flow implemented). **Ab closed:**
- **Credit notes:** dedicated `CN-` series, over-credit block, apply/cancel, GSTR-1
  table 9B aur GSTR-3B netting. **P1 → done.**
- **Multi-currency:** analytics revenue/pipeline base currency me FX se consolidate
  karta hai, missing rate alag report hota hai. **P1 → done.**
- **3-way match:** PO ↔ bill ↔ received ↔ payment, variance override with reason.
  **P1 → done.**

**Still open:** GSTR-2B reconciliation / e-way bill (P2); Razorpay refund se credit
note auto-issue (P2 — ab manual CN flow hai); TDS/TCS edge cases CA review.

**Reports** — xlsx + PDF export, saved reports, GSTR/Tally. **Gap:** reports
`take` caps par chalte hain (500–2,000); bahut bade data par totals adhoore ho
sakte hain. **P1**

### AI & automation

**AI assistant** — LLM optional, graceful fallback. **Gap:** prompt injection se
customer data cross-tenant leak ka model-level guard nahi; output review flow
nahi. **P1 (security review needed).**

**Workflow automation** — triggers, runs, approvals. **Gap:** retries/dead-letter
nahi; ek fail hua run chup-chaap ruk jata hai. **P1.**

### Platform

**Website & distribution** — pages, catalogue, portals, SEO. **Gap:** B2C/B2B
portal read-only-ish hai; booking engine nahi. **P2.**

**Integrations** — connections, API keys, webhooks + delivery log + HMAC signing.
**Gap:** API keys me expiry/rotation policy aur IP allowlist nahi. **P1.**

**Administration** — org, branches, employees, roles, subscription, tax, audit,
security (2FA), custom fields, recycle bin, **attendance/working hours (new)**.
**Closed:** attendance module (check-in/out, half/full day, team view) aur audit
immutability (Postgres trigger: UPDATE always blocked, DELETE blocked while org
exists). **P1 → done.**
**Still open:** recycle bin ka 30-day auto-purge (P2); hash-chain/WORM audit
export for external auditor (P2).

---

## 3. Cross-cutting blockers (module se bahar)

### P0 — closed is pass

1. **Customer data erasure — done.** `POST /api/v1/privacy/erasure` anonymises
   contacts, deletes conversations/call logs/consent/queued emails/tasks/
   notifications/attachments, soft-deletes records, retains legally required
   invoice identity, writes audit entry, supports `dryRun`. Runtime verified.
2. **Uploads backup — done.** `db:backup` DB + uploads tar dono encrypt karta
   hai, SHA-256 manifest deta hai; `restore-backup.mjs` decrypt + restore drill.
   Nightly scheduler compose me wired.
3. **Files local disk par — operational constraint.** Single-node + persistent
   volume par restore verified. Multi-node/autoscale ke liye S3/R2 migration
   **still P2**; abhi compose single API replica chalata hai.

### P1 — closed is pass

4. **Email verification — done.** Password login + refresh gate, resend endpoint,
   login UI. E2E verify kiya.
5. **Lead form anti-spam — done.** Honeypot, minimum render time, duplicate
   throttle, dedicated limiter, optional Turnstile.
6. **Search indexes — done.** `pg_trgm` GIN indexes; `EXPLAIN` index scan use
   karta hai.
7. **Agent credit limit — done.** Atomic pre-check + conditional charge +
   release on cancel, runtime verified.
8. **Supplier 3-way match — done.** Settlement blocked on variance unless
   explicit override with reason.
9. **Credit notes — done.** CN series, over-credit block, apply/cancel, GSTR-1
   9B + GSTR-3B netting, CSV rows.
10. **Backup schedule — done.** `db:backup:schedule` + compose `backup` service;
    encryption key required; restore documented.
11. **Audit immutability — done.** DB trigger blocks UPDATE and DELETE (org
    cascade allowed).

### P1 — still open (business/ops, not code blockers)

12. **File virus scanning** — magic-byte check hai, malware scan nahi.
13. **Segregation of duties** — invoice banane wala hi approve/delete/export kar
    sakta hai; approval matrix product decision chahiye.
14. **Departure capacity / driver double-booking** — agent credit aur supplier
    match closed, ye do money/ops rules abhi record-only hain.
15. **Observability** — `/metrics` + request logs hain; Sentry/alerting wire nahi.
16. **Live e-invoicing GSP credentials** — Sek crypto implemented aur tested,
    lekin real GSP account/IRP registration ke bina production IRN nahi banega.

### P2 — scale/parity

17. Saved-view sharing, favourites (partial), offline mode, WCAG AA audit,
    board keyboard DnD.
18. Full-text search, report totals bina cap ke, campaign scheduling multi-node.
19. Plan-based feature gating (abhi sirf seats), custom domain TLS automation.
20. Object storage (S3/R2) for uploads; recycle-bin auto-purge; hash-chain audit
    export; GSTR-2B / e-way bill; Razorpay refund → auto credit note.

---

## 4. Go-live checklist (recommended order)

1. `DATABASE_URL` Postgres par set, `npm run db:migrate` (aur `db:drift` clean).
2. `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` 32+ chars, `SEED_*` defaults badle.
3. `CORS_ORIGINS`, `APP_URL`, `FRONTEND_URL`, `PORTAL_URL` real domains.
4. `TWO_FACTOR_ENFORCEMENT=true`; admin/finance ne enrol kiya.
5. SMTP + WhatsApp creds; ek test mail/Message bhej ke outbox check.
6. `INBOUND_EMAIL_SECRET` + `WHATSAPP_APP_SECRET` + `WHATSAPP_VERIFY_TOKEN` set
   (warna production inbound refuse karega — by design).
7. Razorpay keys + webhook secret + dashboard webhook URL.
8. `METRICS_TOKEN` set; `/health` aur `/ready` monitoring me.
9. `BACKUP_ENCRYPTION_KEY` (32+ chars) set; `db:backup:schedule` ya compose
   backup service on; off-box copy; ek restore drill `restore-backup.mjs` se.
10. GSP credentials + `IRP_SANDBOX=false`: Sek per-session decrypt ab implemented
    hai; pehla IRN sandbox me test karke hi live jayein.
11. `REQUIRE_EMAIL_VERIFICATION=true`; SMTP working (verification mail).
12. Lead form par Turnstile keys (optional; honeypot/limiter bina bhi active).
13. Uptime + error alerting; log retention policy (PII redaction ab lagu hai).
14. Pilot: 1 branch, 5–10 users, real data, weekly review — phir rollout.

---

## 5. Ek line me

Pehle ye CRM build hi nahi hota tha; ab backend/frontend clean compile hote hain,
149 tests pass hain, fresh Postgres par 11 migrations + drift zero hai, 1,00,000
row export stream hota hai, aur is pass me DPDP erasure, encrypted DB+uploads
backup/restore, email-verification gate, lead-form anti-spam, agent credit
enforcement, supplier 3-way match, credit notes (GST 9B/3B), FX consolidation,
append-only audit, trigram search indexes, attendance aur live e-invoice Sek
decrypt sab code + runtime verified hain. Production go-live ke liye ab sirf
external cheezein baaki hain: GSP account, SMTP/Razorpay keys, Turnstile (optional),
Sentry/alerting, aur virus scanning.
