# Traveldesk — Production Deployment Guide

Everything needed to run this SaaS for real: database, delivery channels,
payments, flights, AI, backups and the platform super admin.

---

## 1. Environment checklist (backend `.env`)

| Variable | Purpose | Without it |
| --- | --- | --- |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Auth tokens. **32+ chars in production.** | Server refuses to boot securely |
| `PLATFORM_ADMIN_EMAILS` | Comma-separated super admin emails landing on `/admin` | Platform portal returns 403 |
| `SEED_SUPER_ADMIN_EMAIL` / `PASSWORD` | Idempotent super admin seeding | Default `superadmin@traveldesk.io` / `Superadmin@123` — change it |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASSWORD` `SMTP_FROM` | Real email delivery (any SMTP provider — Gmail app password, Brevo, SES…) | Emails stay **queued** in the outbox, visible in-app |
| `WHATSAPP_TOKEN` `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business Cloud API (Meta) | WhatsApp messages stay queued |
| `RAZORPAY_KEY_ID` `RAZORPAY_KEY_SECRET` | Real payment links & checkout | Payment links are recorded, not charged |
| `RAZORPAY_WEBHOOK_SECRET` | Signature verification for `POST /api/v1/webhooks/razorpay` | Webhooks are rejected (invalid signature) |
| `AMADEUS_CLIENT_ID` `AMADEUS_CLIENT_SECRET` | Live flight search (`AMADEUS_HOST` defaults to the test API) | Flight search reports "needs credentials" — no fake fares |
| `LLM_API_KEY` | Real AI assistant + itinerary generation | Assistant answers from built-in rules and says so in the UI |
| `CORS_ORIGINS` | Frontend origins allowed | Default localhost set only |
| `APP_URL` | Public API URL used in emails/links | Default `http://localhost:4000` |

No key makes the app break — every integration degrades to a clearly-labelled
queued/mock mode so the CRM stays honest about what actually went out.

### Per-company email & WhatsApp (no server keys needed)

Each company can connect **its own** accounts from
**Settings → Email & WhatsApp** — no admin action, no server restart:

- **Email:** SMTP host, port, username, app password (for Gmail: Google
  Account → Security → 2‑Step Verification → App passwords), From address.
  A test send proves it before you go live. Stored on the organisation, so it
  only applies to that company's workspace.
- **WhatsApp:** Meta WhatsApp Cloud API phone number ID + permanent access
  token, with a test message to a real number.

These workspace settings override the server env for that company, and the
env stays as the fallback for everyone else.

## 2. Database

### Migrations (the only way to change a production schema)

The schema is versioned in `backend/prisma/migrations`. Never run `db push`
against a database that holds real data — it compares and rewrites without a
record of what it did.

```bash
cd backend
npm run db:migrate      # prisma migrate deploy — applies pending migrations
```

A database that was created before migrations existed (any `db push` install)
is already at `0_init`. Mark it once, do not re-run it:

```bash
npm run db:baseline     # prisma migrate resolve --applied 0_init
```

Changing the schema later:

```bash
npx prisma migrate dev --name add_something   # creates prisma/migrations/<ts>_add_something
npm run db:drift                              # fails if the database and schema disagree
```

Deploy order: run `db:migrate` **before** starting the new build, so the old
process never sees a column it does not know about.

### Quick start (SQLite — dev/small offices)
```bash
cd backend
npm install
npx prisma generate
npm run db:migrate
npm run seed
npm run dev
```

### PostgreSQL (recommended for production)
```bash
# 1) Switch the Prisma provider (static by design)
npm run db:pg            # edits prisma/schema.prisma to provider = "postgres"

# 2) Point DATABASE_URL at your server
#    e.g. postgres://traveldesk:PASSWORD@db.example.com:5432/traveldesk

# 3) Create the schema and seed
npx prisma generate
npm run db:migrate
npm run seed

# Back to SQLite (dev):
npm run db:sqlite
```

Docker one-liner with Postgres included:

```bash
DATABASE_PROVIDER=postgres \
DATABASE_URL=postgres://traveldesk:traveldesk-change-me@postgres:5432/traveldesk \
docker compose up --build
```

The compose file ships a `postgres:16` service with a persistent volume.
Carrying *existing* SQLite data into Postgres is a one-time ETL: the schema is
plain Prisma models, so a dump/restore script or `prisma` + JSON export does
it — start clean if you have no production data yet.

## 3. Backups

- **SQLite:** `npm run db:backup` copies `data/traveldesk.db` (plus WAL
  sidecars) into `data/backups/`, keeping the 14 newest by default
  (`BACKUPS_TO_KEEP` to change). Put it in cron/systemd timer, e.g. daily.
- **Postgres:** `pg_dump -Fc "$DATABASE_URL" > backup-$(date +%F).dump`
  and restore with `pg_restore`. Recommended: run nightly, plus a second
  off-box copy of the week's dumps.

## 4. Razorpay webhooks

After setting keys, in the Razorpay dashboard create a webhook:

- **URL:** `https://<your-domain>/api/v1/webhooks/razorpay`
- **Events:** `payment_link.paid`, `payment_link.partially_paid`
- **Secret:** same value as `RAZORPAY_WEBHOOK_SECRET`

When a link is paid the invoice record flips to **Paid** automatically and the
entry appears in the finance outbox trail.

## 5. Real-world flows that are live

- **Lead capture:** every company has a hosted form at `/lead/<org-slug>` and
  an embed snippet (Website & distribution → Website pages). Submissions
  become Leads + an email alert to the workspace admin.
- **Invoices:** downloadable GST-invoice PDF per record (Quick actions →
  Invoice PDF), payment links, email-the-invoice, delivery status in outbox.
- **Quotations & proposals:** the Price quotes page opens a full cover page
  (company masthead, priced package breakdown, GST, validity date) and
  produces a real PDF via **Download PDF**, sent by **Email quotation**.
  A proposal is the same document with "TRAVEL PROPOSAL" and soft terms —
  create one from any enquiry via *Create proposal* in the side panel.
- **Side panel (no popups):** every record opens in a right-hand panel with
  contact actions, follow-ups (with a real due date), the journey rail and
  every detail. *Create quotation* / *Create proposal* open a second screen
  inside that same panel; *Convert to booking* creates the booking in one
  click. The row `···` menu does the same actions plus stage changes,
  assignment and delete.
- **Customer Information cover:** clicking a customer opens a full page with
  interaction history (each card opens the panel), this customer's follow-ups
  on the calendar, the stage funnel with the enquiries behind each stage, and
  the complete detail list.
- **Email & WhatsApp:** clicking Email or WhatsApp on any record hands off to
  Communications with that contact open — email and phone side by side, and
  you can start the thread from there.
- **Call logs, templates, consent:** Communications → Call logs records every
  call with direction, outcome and talk time; Templates saves the replies you
  send every day; Consent records which channels each customer agreed to.
- **Your own email account:** Settings → Email & WhatsApp stores the
  company's SMTP login (Gmail app password, Zoho, Outlook…) and WhatsApp
  Cloud credentials per workspace, with test sends. Workspace settings win
  over the server env, so every company can run its own inbox.
- **Messages:** outbound email/WhatsApp on a conversation is delivered for
  real when credentials exist; otherwise queued with a clear status.
- **Members:** inviting a teammate queues/sends the invite email.
- **Flights:** live Amadeus fares when keys are configured.
- **Multi-currency:** per-record currency (INR/USD/EUR/GBP/AED/SGD) set while
  editing the amount; FX rates editable in Settings → Tax settings; invoices
  show the applied rate.
- **Layouts:** List, Board and Cards on every module; the Cards layout
  matches the customer card design.

## 6. Super admin (platform portal)

- Portal lives at `/admin` — a separate dashboard, not inside any company's CRM.
- Access is by `PLATFORM_ADMIN_EMAILS` (default seeded user included).
- Can view all companies, create/delete plans, and move a company between
  plans; deleting a plan fails cleanly if any company is subscribed to it.

## 7. Two-factor authentication

- Company admins, branch managers and finance must enrol an authenticator app
  (any TOTP app: Google Authenticator, Authy, 1Password) before the workspace
  opens for them. The first sign-in lands on a single setup screen, so nobody
  has to hunt for the setting.
- Ten single-use recovery codes are shown once at enrolment. They are stored as
  hashes; support cannot read them back, only reissue them.
- `TWO_FACTOR_ENFORCEMENT=true` is the production default. Setting it to `false`
  turns the *requirement* off but leaves enrolment available in
  Settings → Profile.
- A password change, password reset, member deactivation or role change bumps
  the account's token version, which ends every existing session immediately —
  not after the 15-minute access token expires.
- Sales, operations and support keep password-only sign-in on purpose: forcing
  a second factor on a small front desk leads to codes being shared on
  WhatsApp, which is worse than no second factor.

## 8. GST, Tally and compliance exports

- `GET /api/v1/gst/gstr1?month=YYYY-MM` returns GSTR-1 data as JSON;
  add `&format=csv` for the file most accountants upload.
- `GET /api/v1/gst/gstr3b?month=YYYY-MM` returns the 3B summary.
- `GET /api/v1/tally/export?month=YYYY-MM` returns Tally-ready XML with
  CGST/SGST/IGST ledgers, place of supply and party GSTIN.
- Both use `services/gst.ts`, the same rules the invoice PDF and the tax
  working paper use, so the three cannot disagree.
- An unknown place of supply is never assumed to be local: it prints as a
  warning on the invoice and is flagged in the exports.
- IRP e-invoicing (IRN/QR) is **not** integrated yet; use your GSP portal until
  it is.

## 9. Running the frontend in production

```bash
npm run build        # vite build
npx vite preview     # or serve dist/ behind nginx/caddy
```

Serve the API on the same domain or set `CORS_ORIGINS` accordingly.

## 10. Health and metrics

- `GET /api/v1/health` returns service status — wire it into uptime monitoring.
- `GET /api/v1/ready` checks the database connection.
- `GET /api/v1/metrics` returns Prometheus text: request counts by route and
  status, total latency, in-flight requests and process memory.
  Set `METRICS_TOKEN` to require `Authorization: Bearer <token>`; with no token
  the endpoint is served in development and hidden in production.
