#!/bin/sh
# Production startup script.
#
# Runs database migrations first, then starts the API server.
# Use this instead of `npm start` on every deployment so schema changes
# are applied atomically before any traffic hits the new code.
#
# Usage:
#   chmod +x scripts/start-production.sh
#   ./scripts/start-production.sh
#
# Docker / Railway / Render: set CMD to this script.

set -e

echo "==> Running database migrations..."
npx prisma migrate deploy

echo "==> Starting Traveldesk API..."
exec node dist/index.js
