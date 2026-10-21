#!/bin/sh
set -e

echo "→ Preparing SQLite database ..."
# SQLite has no migration server; push the Prisma schema to the database file.
npx prisma db push --skip-generate --accept-data-loss

if [ "${SEED_ON_START}" = "true" ]; then
  echo "→ Seeding demo organisation (idempotent) ..."
  node dist/db/seed.js || echo "Seed skipped/failed (non-fatal)."
fi

echo "→ Starting Traveldesk API on port ${PORT:-4000} ..."
exec node dist/index.js
