# Traveldesk API — Enterprise SaaS Backend

Production-grade Node.js backend for the **Traveldesk** travel business workspace. It powers the
entire CRM/ERP that the existing frontend renders — leads, customers, quotations, bookings,
flights, hotels, visa, finance, B2B agents, automation, reports, the AI assistant and the
organisation settings — behind a multi-tenant, role-based, audit-logged REST API.

> **Stack:** Node.js 20 · TypeScript · Express · Prisma · **PostgreSQL** · JWT + bcrypt · Zod · Pino · Docker

> **Database:** PostgreSQL only. Money columns are native `DECIMAL(14,2)` so
> receipts, ledgers and GST invoices agree to the paisa, and Prisma's SQLite
> connector cannot represent that type. `npm run db:sqlite` refuses on purpose;
> an old SQLite install moves across once with `scripts/migrate-sqlite-to-postgres.mjs`.

---

## 1. Quick start (local)

```bash
cd backend
# 1) PostgreSQL (skip if you already have a server)
docker compose -f docker-compose.dev.yml up -d

cp .env.example .env          # set DATABASE_URL to your postgres:// URL
npm install
npm run db:migrate            # applies prisma/migrations
npm run seed                  # seeds the demo organisation (Horizon Travel)
npm run dev                   # http://localhost:4000/api/v1
```

Seeded login:

| Field    | Value                      |
| -------- | -------------------------- |
| Email    | `owner@horizontravel.in`   |
| Password | `Traveldesk@123`           |

The seed also prints a one-time API key (`tdk_…`) you can use for machine-to-machine calls.

### Useful scripts

| Script                  | Purpose                                        |
| ----------------------- | ---------------------------------------------- |
| `npm run dev`           | Hot-reloading dev server (tsx watch)           |
| `npm run build`         | `prisma generate` + TypeScript compile to `dist` |
| `npm start`             | Run the compiled server                        |
| `npm run seed`          | Idempotent demo seed                           |
| `npm run db:migrate`    | Apply versioned migrations (`prisma migrate deploy`) |
| `npm run db:baseline`   | Mark a pre-migration database as `0_init` |
| `npm run prisma:studio` | Browse the Postgres data in Prisma Studio       |
| `npm run db:reset`      | Force-reset the database                       |
| `npm test`              | Vitest + Supertest smoke suite                 |
| `npm run typecheck`     | TypeScript type check                          |

---

## 2. Docker

The API container is built against the PostgreSQL Prisma engine and refuses to
start without a `postgres://` `DATABASE_URL`. Uploads live on the
`traveldesk-data` volume; the database lives in the `postgres` service's own
volume. A local database inside the API container would be lost on every
deploy, so there is no fallback.

```bash
cd backend
docker compose up --build
# → http://localhost:4000/api/v1/health
```

On first boot the entrypoint runs `prisma migrate deploy` (all versioned migrations) and, when
`SEED_ON_START=true`, seeds the demo data automatically. It never runs `db push`, so a container
restart cannot rewrite a production schema without a migration record.

Override secrets for a real deployment:

```bash
JWT_ACCESS_SECRET=$(openssl rand -hex 48) \
JWT_REFRESH_SECRET=$(openssl rand -hex 48) \
SEED_OWNER_PASSWORD='something-strong' \
docker compose up --build -d
```

The database + uploads live on the `traveldesk-data` volume (`/app/data`).

---

## 3. Architecture

```
src/
├── index.ts                 # bootstrap: db init, auto-seed, HTTP server, graceful shutdown
├── app.ts                   # Express app: security headers, CORS, logging, routes, errors
├── config/env.ts            # Zod-validated environment
├── domain/
│   ├── modules.ts           # the 24-module workspace catalogue (mirrors the frontend)
│   └── rbac.ts              # built-in roles + permission matrix
├── lib/                     # prisma, logger, errors, jwt, password, csv, pagination, utils
├── middlewares/             # auth, rbac, validate, error, request-context, rate-limit
├── services/                # records engine, analytics, audit, notifications, ai
├── modules/                 # one router per feature area
├── routes/index.ts          # mounts every router under /api/v1
├── db/                      # seed data + seed runner
└── types/express.d.ts       # request augmentation (auth context)
prisma/schema.prisma         # full data model (PostgreSQL)
```

### Design principles

- **Multi-tenant:** every tenant-scoped row carries `organizationId`; the tenant is derived from the
  JWT (or API key), never from client input.
- **Role-based access:** each route declares the action it needs (`view`, `create`, `edit`,
  `approve`, `export`, `delete`) and the middleware resolves the caller's role permissions.
- **Generic record engine:** all 24 modules share one `Record` table + one CRUD/export/stat engine,
  so adding a module is a one-line catalogue change, not a new table.
- **Audit everything:** create/update/delete/login/export/connect actions are written to an immutable
  audit trail.
- **Consistent envelopes:** every response is `{ success, data }` or `{ success:false, error }`.
- **No external side effects from UI actions:** messages, automations and uploads are recorded
  in-workspace only. No supplier or payment provider is contacted from these paths.

---

## 4. Environment variables

See [`.env.example`](.env.example) for the full list. Key ones:

| Variable                        | Description                                        |
| ------------------------------- | -------------------------------------------------- |
| `DATABASE_URL`                  | PostgreSQL URL (`postgres://user:pass@host:5432/db`) |
| `JWT_ACCESS_SECRET`             | Signing key for access tokens (min 16 chars)       |
| `JWT_REFRESH_SECRET`            | Signing key for refresh tokens (min 16 chars)      |
| `ACCESS_TOKEN_TTL`              | Access token lifetime (default `15m`)              |
| `REFRESH_TOKEN_TTL_DAYS`        | Refresh token lifetime (default `30`)              |
| `CORS_ORIGINS`                  | Comma-separated allowed browser origins            |
| `SEED_ON_START`                 | Seed the demo org on boot if empty                 |
| `LLM_API_KEY` / `LLM_BASE_URL`  | Optional OpenAI-compatible endpoint for the assistant |

---

## 5. Authentication

1. `POST /api/v1/auth/register` — create an organisation + first admin, returns tokens.
2. `POST /api/v1/auth/login` — email + password, returns access + refresh tokens.
3. Send `Authorization: Bearer <accessToken>` on every subsequent call.
4. `POST /api/v1/auth/refresh` — rotate the refresh token into a new pair.

Tokens are also set as `httpOnly` cookies for browser clients. API keys (`x-api-key: tdk_…`) are
accepted for server-to-server integration and the B2B agent portal.

---

## 6. API reference (`/api/v1`)

### Platform
| Method | Path        | Description               |
| ------ | ----------- | ------------------------- |
| GET    | `/health`   | Liveness probe            |
| GET    | `/ready`    | Readiness (DB check)      |
| GET    | `/meta`     | Service + module metadata |

### Identity & team
| Method | Path                              | Description                        |
| ------ | --------------------------------- | ---------------------------------- |
| POST   | `/auth/register` `/auth/login` `/auth/refresh` `/auth/logout` | Session lifecycle |
| GET/PATCH | `/auth/me`                     | Current profile                    |
| POST   | `/auth/change-password` `/auth/forgot-password` `/auth/reset-password` | Credentials |
| GET/PATCH | `/organizations/current`       | Organisation profile & settings    |
| GET    | `/organizations/current/modules`  | Module catalogue + navigation      |
| GET/POST | `/organizations/current/branches` | Branch directory (PATCH/DELETE by id) |
| GET/POST | `/members`                      | Team directory & invites           |
| GET/POST | `/roles`, `/roles/matrix`        | Roles + permission matrix          |
| GET/POST/DELETE | `/api-keys`              | Integration keys                   |

### Workspace (all 24 modules)
| Method | Path                                        | Action  |
| ------ | ------------------------------------------- | ------- |
| GET    | `/workspace/modules`                        | —       |
| GET    | `/workspace/:module/records`                | view    |
| GET    | `/workspace/:module/records/:id`            | view    |
| POST   | `/workspace/:module/records`                | create  |
| PATCH  | `/workspace/:module/records/:id`            | edit    |
| DELETE | `/workspace/:module/records/:id`            | delete  |
| POST   | `/workspace/:module/records/bulk`           | edit    |
| GET    | `/workspace/:module/facets`                 | view    |
| GET    | `/workspace/:module/stats`                  | view    |
| GET    | `/workspace/:module/export.csv`             | export  |

Filters on the list endpoint: `status`, `destination`, `owner`, `branch`, `source`, `search`, `tab`,
`from`, `to`, `sort`, `order`, `page`, `pageSize`.

### Engagement, insights & commerce
| Area           | Paths                                                                 |
| -------------- | --------------------------------------------------------------------- |
| Tasks          | `/tasks`, `/tasks/summary`, `/tasks/:id/toggle`                        |
| Custom fields  | `/custom-fields?module=`                                              |
| Notifications  | `/notifications`, `/notifications/:id/read`, `/notifications/read-all` |
| Dashboard      | `/dashboard/overview`, `/dashboard/alerts`, `/dashboard/counters`      |
| Reports        | `/reports/:report`, `/reports/saved`                                   |
| Audit trail    | `/audit`                                                               |
| Search         | `/search?q=`                                                           |
| AI assistant   | `/assistant/chat`, `/assistant/itinerary`, `/assistant/messages`       |
| Shared inbox   | `/conversations`, `/conversations/:id/messages`, `/conversations/templates` |
| Automation     | `/workflows`, `/workflows/:id/run`, `/workflows/runs`                  |
| Integrations   | `/integrations`, `/integrations/:id/connect`, `/integrations/webhooks`  |
| Billing (SaaS) | `/billing/plans`, `/billing/subscription`, `/billing/invoices`         |
| Uploads        | `/uploads` (multipart `file`)                                          |

---

## 7. The 24 modules

Covered one-to-one with the frontend catalogue:

`leads` · `customers` · `quotations` · `companies` · `inbox` · `campaigns` · `bookings` · `flights` ·
`hotels` · `packages` · `transfers` · `visa` · `groups` · `operations` · `suppliers` · `support` ·
`agents` · `finance` · `assistant` · `automation` · `reports` · `distribution` · `integrations` ·
`settings`

---

## 8. Roles & permissions

Seeded built-in roles: **Company admin, Branch manager, Sales, Operations, Finance, Support.**
Permissions are `{ modules, actions }` where either side can be `"*"` or an explicit allow-list.
Company admins can create custom roles and edit the matrix from the administration workspace.

---

## 9. Testing

```bash
npm test
```

The smoke suite verifies the health/meta endpoints, the structured 404 envelope and the auth guards.
