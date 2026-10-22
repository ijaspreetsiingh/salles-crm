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

## 2. Database

### Quick start (SQLite — dev/small offices)
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
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
npx prisma db push
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
- **Messages:** outbound email/WhatsApp on a conversation is delivered for
  real when credentials exist; otherwise queued with a clear status.
- **Members:** inviting a teammate queues/sends the invite email.
- **Flights:** live Amadeus fares when keys are configured.
- **Multi-currency:** per-record currency (INR/USD/EUR/GBP/AED/SGD) set while
  editing the amount; FX rates editable in Settings → Tax settings; invoices
  show the applied rate.

## 6. Super admin (platform portal)

- Portal lives at `/admin` — a separate dashboard, not inside any company's CRM.
- Access is by `PLATFORM_ADMIN_EMAILS` (default seeded user included).
- Can view all companies, create/delete plans, and move a company between
  plans; deleting a plan fails cleanly if any company is subscribed to it.

## 7. Running the frontend in production

```bash
npm run build        # vite build
npx vite preview     # or serve dist/ behind nginx/caddy
```

Serve the API on the same domain or set `CORS_ORIGINS` accordingly.

## 8. Health

`GET /api/v1/health` returns service status — wire it into uptime monitoring.
