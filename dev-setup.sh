#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────────────────
# LogShield — Local Development Setup
# ──────────────────────────────────────────────────────────
# This script handles everything needed to run the app locally:
#   1. Starts PostgreSQL in Docker (if not already running)
#   2. Copies .env.example → .env (if no .env exists)
#   3. Installs npm dependencies
#   4. Runs database migrations
#   5. Seeds the demo user
#   6. Starts the dev server
#
# Prerequisites: Docker, Node.js 22+, npm
# Usage:        ./dev-setup.sh
# ──────────────────────────────────────────────────────────

CONTAINER_NAME="logshield-db"
DB_USER="logshield"
DB_PASS="logshield_secret"
DB_NAME="logshield"
DB_PORT="5432"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}?schema=public"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

step() { echo -e "\n${BLUE}▸ $1${NC}"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }
fail() { echo -e "  ${RED}✗ $1${NC}"; exit 1; }

# ── 0. Check prerequisites ────────────────────────────────
step "Checking prerequisites"

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Install it from https://docs.docker.com/get-docker/"
command -v node >/dev/null 2>&1   || fail "Node.js is not installed. Install v22+ from https://nodejs.org/"
command -v npm >/dev/null 2>&1    || fail "npm is not installed."

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
  fail "Node.js 22+ required (found v$(node -v))"
fi
ok "Docker, Node.js $(node -v), npm $(npm -v)"

# ── 1. Start PostgreSQL ───────────────────────────────────
step "Starting PostgreSQL"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  ok "Container '${CONTAINER_NAME}' is already running"
elif docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  docker start "$CONTAINER_NAME" >/dev/null
  ok "Started existing container '${CONTAINER_NAME}'"
else
  docker run -d --name "$CONTAINER_NAME" \
    -e POSTGRES_USER="$DB_USER" \
    -e POSTGRES_PASSWORD="$DB_PASS" \
    -e POSTGRES_DB="$DB_NAME" \
    -p "${DB_PORT}:5432" \
    postgres:16-alpine >/dev/null
  ok "Created and started container '${CONTAINER_NAME}'"
fi

# Wait for PostgreSQL to be ready
echo -n "  Waiting for PostgreSQL"
for i in $(seq 1 30); do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    echo ""
    ok "PostgreSQL is ready"
    break
  fi
  echo -n "."
  sleep 1
  if [ "$i" -eq 30 ]; then
    echo ""
    fail "PostgreSQL did not become ready in time"
  fi
done

# ── 2. Environment file ───────────────────────────────────
step "Checking environment file"

if [ ! -f .env ]; then
  cp .env.example .env
  # Set the DATABASE_URL to the local Docker instance
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
  else
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"${DATABASE_URL}\"|" .env
  fi
  ok "Created .env from .env.example"
  warn "Edit .env to add OAuth keys and API keys (optional)"
else
  ok ".env already exists"
fi

# ── 3. Install dependencies ───────────────────────────────
step "Installing dependencies"
npm install --loglevel=warn
ok "Dependencies installed"

# ── 4. Run migrations ─────────────────────────────────────
step "Running database migrations"
npx prisma migrate dev --skip-generate 2>&1 | tail -5
ok "Migrations applied"

# ── 5. Seed demo user ─────────────────────────────────────
step "Seeding demo user"
npx tsx prisma/seed.ts 2>&1
ok "Demo user ready"

# ── 6. Start dev server ───────────────────────────────────
step "Starting development server"
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  LogShield is starting at http://localhost:3000${NC}"
echo -e "${GREEN}  Demo login: demo@logshield.dev / demo123${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════${NC}"
echo ""

npm run dev
