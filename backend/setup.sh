#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Traveldesk — One-command production setup
#
# Usage:
#   chmod +x setup.sh
#   ./setup.sh
#
# What this does:
#   1. Checks prerequisites (docker, docker compose, node, openssl)
#   2. Copies .env.example → .env if .env doesn't exist
#   3. Auto-generates JWT secrets, VAPID keys
#   4. Validates all required vars are set
#   5. Runs database migrations
#   6. Builds and starts all Docker services
#   7. Issues a Let's Encrypt SSL certificate
#   8. Prints a summary with your app URL
#
# Run this once on a fresh Ubuntu 22.04 / Debian 12 VPS.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${GREEN}[INFO]${RESET}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERROR]${RESET} $*"; exit 1; }
section() { echo -e "\n${BOLD}── $* ──${RESET}"; }

# ── Step 1: Prerequisites ─────────────────────────────────────────────────────
section "Checking prerequisites"

command -v docker        >/dev/null 2>&1 || error "Docker is not installed. Visit https://docs.docker.com/get-docker/"
command -v docker        >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 || \
  command -v docker-compose >/dev/null 2>&1 || error "Docker Compose not found"
command -v openssl       >/dev/null 2>&1 || error "openssl is required"
command -v node          >/dev/null 2>&1 || warn "Node.js not found — VAPID keys will be skipped"

info "Prerequisites OK"

# ── Step 2: Create .env from example ─────────────────────────────────────────
section "Environment configuration"

if [ ! -f ".env" ]; then
  cp .env.example .env
  info "Created .env from .env.example"
else
  info ".env already exists — skipping copy"
fi

# ── Step 3: Auto-generate secrets ────────────────────────────────────────────
section "Generating secrets"

generate_secret() {
  openssl rand -hex 32
}

# JWT secrets
if grep -q "JWT_ACCESS_SECRET=CHANGE_ME" .env 2>/dev/null || grep -q "JWT_ACCESS_SECRET=$" .env 2>/dev/null; then
  ACCESS_SECRET=$(generate_secret)
  REFRESH_SECRET=$(generate_secret)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i "" "s|JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${ACCESS_SECRET}|" .env
    sed -i "" "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${REFRESH_SECRET}|" .env
  else
    sed -i "s|JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${ACCESS_SECRET}|" .env
    sed -i "s|JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${REFRESH_SECRET}|" .env
  fi
  info "JWT secrets generated"
else
  info "JWT secrets already set"
fi

# VAPID keys for push notifications
if command -v node >/dev/null 2>&1 && grep -q "VAPID_PUBLIC_KEY=$" .env 2>/dev/null; then
  info "Generating VAPID keys…"
  VAPID_OUTPUT=$(npx --yes web-push generate-vapid-keys --json 2>/dev/null || echo "")
  if [ -n "$VAPID_OUTPUT" ]; then
    VAPID_PUB=$(echo "$VAPID_OUTPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).publicKey))")
    VAPID_PRI=$(echo "$VAPID_OUTPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).privateKey))")
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i "" "s|VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=${VAPID_PUB}|" .env
      sed -i "" "s|VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=${VAPID_PRI}|" .env
    else
      sed -i "s|VAPID_PUBLIC_KEY=.*|VAPID_PUBLIC_KEY=${VAPID_PUB}|" .env
      sed -i "s|VAPID_PRIVATE_KEY=.*|VAPID_PRIVATE_KEY=${VAPID_PRI}|" .env
    fi
    info "VAPID keys generated"
  fi
fi

# ── Step 4: Validate required vars ───────────────────────────────────────────
section "Validating configuration"

source .env 2>/dev/null || true

REQUIRED_VARS=(
  "DOMAIN"
  "POSTGRES_PASSWORD"
  "JWT_ACCESS_SECRET"
  "JWT_REFRESH_SECRET"
  "SEED_SUPER_ADMIN_PASSWORD"
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  val="${!var:-}"
  if [ -z "$val" ] || [[ "$val" == *"CHANGE_ME"* ]]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  warn "The following variables need to be set in .env before continuing:"
  for v in "${MISSING[@]}"; do
    echo "   • $v"
  done
  echo ""
  echo "Edit .env then re-run this script."
  exit 1
fi

# Replace placeholder domain in nginx.conf
DOMAIN="${DOMAIN:-yourdomain.com}"
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i "" "s|yourdomain.com|${DOMAIN}|g" nginx.conf
else
  sed -i "s|yourdomain.com|${DOMAIN}|g" nginx.conf
fi
info "nginx.conf updated with domain: $DOMAIN"

# ── Step 5: Pull images and build ─────────────────────────────────────────────
section "Building Docker images"
docker compose -f docker-compose.prod.yml build --parallel
info "Images built"

# ── Step 6: Start services (DB first, then migrate) ───────────────────────────
section "Starting database"
docker compose -f docker-compose.prod.yml up -d postgres
info "Waiting for PostgreSQL to be ready…"

RETRIES=30
until docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U "${POSTGRES_USER:-traveldesk}" >/dev/null 2>&1; do
  RETRIES=$((RETRIES-1))
  if [ $RETRIES -eq 0 ]; then error "PostgreSQL failed to start"; fi
  sleep 2
done
info "PostgreSQL is ready"

section "Running database migrations"
docker compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy
info "Migrations complete"

# ── Step 7: Start all services ───────────────────────────────────────────────
section "Starting all services"
docker compose -f docker-compose.prod.yml up -d
info "All services started"

# ── Step 8: SSL certificate (Let's Encrypt) ───────────────────────────────────
section "Issuing SSL certificate"

SSL_EMAIL="${SSL_EMAIL:-admin@${DOMAIN}}"

# Only issue if certificate doesn't exist yet
if [ ! -d "./certbot/live/${DOMAIN}" ]; then
  docker compose -f docker-compose.prod.yml run --rm certbot \
    certonly --webroot -w /var/www/certbot \
    -d "${DOMAIN}" -d "api.${DOMAIN}" \
    --email "${SSL_EMAIL}" \
    --agree-tos --no-eff-email
  info "SSL certificate issued for ${DOMAIN}"
  docker compose -f docker-compose.prod.yml restart nginx
  info "Nginx restarted with SSL"
else
  info "SSL certificate already exists — skipping"
fi

# ── Step 9: Health check ─────────────────────────────────────────────────────
section "Health check"
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/health" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
  info "Health check passed (HTTP $HTTP_STATUS)"
else
  warn "Health check returned HTTP $HTTP_STATUS — check logs with: docker compose -f docker-compose.prod.yml logs"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  Traveldesk is live!${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}App:${RESET}    https://${DOMAIN}"
echo -e "  ${BOLD}API:${RESET}    https://api.${DOMAIN}/api/v1/health"
echo -e "  ${BOLD}Login:${RESET}  ${SEED_SUPER_ADMIN_EMAIL:-superadmin@${DOMAIN}}"
echo ""
echo -e "  Next steps:"
echo -e "  • Configure SMTP, WhatsApp, Razorpay in .env → docker compose restart api"
echo -e "  • Generate VAPID keys: npx web-push generate-vapid-keys"
echo -e "  • Set up Hotelbeds: HOTELBEDS_API_KEY + HOTELBEDS_SECRET in .env"
echo -e "  • SSL auto-renew: add to crontab:"
echo -e "    0 3 * * * cd $(pwd) && docker compose -f docker-compose.prod.yml run --rm certbot renew && docker compose -f docker-compose.prod.yml restart nginx"
echo ""
