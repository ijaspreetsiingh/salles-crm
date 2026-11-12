#!/bin/sh
set -e

# Real databases get versioned migrations, never `db push`. Prisma's push
# compares schemas and rewrites the database with no record of what changed —
# on a production Postgres that can drop a column full of customer data.
#
# A Postgres database that existed before migrations were added must be
# baselined once (see DEPLOY.md → `npm run db:baseline`).
if echo "${DATABASE_URL:-}" | grep -Eq '^postgres(ql)?://'; then
  echo "→ Applying database migrations (Postgres) ..."
  npx prisma migrate deploy
else
  # No silent SQLite fallback in a container: a file inside the image or an
  # ephemeral volume looks like a working CRM until the next deploy wipes it.
  echo "✖ DATABASE_URL must be a postgres:// URL. SQLite is not supported by this schema" >&2
  echo "  (money columns use DECIMAL(14,2), which Prisma's SQLite connector cannot represent)." >&2
  exit 1
fi

if [ "${SEED_ON_START}" = "true" ]; then
  echo "→ Seeding demo organisation (idempotent) ..."
  node dist/db/seed.js || echo "Seed skipped/failed (non-fatal)."
fi

echo "→ Starting Traveldesk API on port ${PORT:-4000} ..."
exec node dist/index.js
