#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$PROJECT_ROOT/docs/supabase_wsl_migration.sql"
SUPABASE_CONFIG="$HOME/.codex-recovery/supabase.json"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql was not found. Install PostgreSQL client first."
  exit 1
fi

if [ ! -f "$SQL_FILE" ]; then
  echo "Migration SQL not found: $SQL_FILE"
  exit 1
fi

echo "Codex Recovery WSL Supabase migration"
echo ""
echo "This runs only:"
echo "$SQL_FILE"
echo ""
echo "It adds missing WSL isolation columns with IF NOT EXISTS."
echo "It does not drop tables, delete rows, or overwrite Windows CLI records."
echo ""
if [ ! -f "$SUPABASE_CONFIG" ]; then
  echo "Supabase config not found: $SUPABASE_CONFIG"
  echo "Run scripts/configure-supabase.sh first."
  exit 1
fi

PROJECT_REF="$(node - "$SUPABASE_CONFIG" <<'NODE'
const fs = require("fs");
const file = process.argv[2];
const config = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const match = String(config.url || "").match(/^https:\/\/([^.]+)\.supabase\.co\/?$/);
if (!match) process.exit(1);
process.stdout.write(match[1]);
NODE
)"

if [ -z "$PROJECT_REF" ]; then
  echo "Could not parse Supabase project ref from $SUPABASE_CONFIG"
  exit 1
fi

echo "Project ref: $PROJECT_REF"
echo ""
echo "Paste only your Supabase database password."
echo "This is the database password set when the Supabase project was created."
echo "Do not paste GitHub token, Supabase API key, or OpenAI key here."
echo ""
printf "Database password: "
stty -echo
IFS= read -r DB_PASSWORD
stty echo
printf "\n"

if [ -z "${DB_PASSWORD:-}" ]; then
  echo "No database password provided."
  exit 1
fi

echo ""
echo "Running migration..."
POOLER_URL="postgresql://postgres.${PROJECT_REF}:${DB_PASSWORD}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres:${DB_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres?sslmode=require"

if ! psql "$POOLER_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"; then
  echo ""
  echo "Pooler connection failed. Trying direct database connection..."
  psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"
fi

unset DB_PASSWORD POOLER_URL DIRECT_URL

echo ""
echo "Migration finished."
echo "Now verifying WSL backup upload..."

PATH="$PROJECT_ROOT:$PATH" codex-recovery backup
PATH="$PROJECT_ROOT:$PATH" codex-recovery checkpoint "WSL CLI environment synced to GitHub and Supabase"
PATH="$PROJECT_ROOT:$PATH" codex-recovery restore-plan

echo ""
echo "WSL CLI Supabase sync completed."
