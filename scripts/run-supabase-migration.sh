#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SQL_FILE="$PROJECT_ROOT/docs/supabase_wsl_migration.sql"

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
echo "Paste your Supabase Postgres connection string."
echo "It should look like:"
echo "postgresql://postgres.<project-ref>:<password>@aws-...pooler.supabase.com:6543/postgres"
echo "or:"
echo "postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres"
echo ""
printf "Connection string: "
stty -echo
IFS= read -r DATABASE_URL
stty echo
printf "\n"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "No connection string provided."
  exit 1
fi

echo ""
echo "Running migration..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$SQL_FILE"

unset DATABASE_URL

echo ""
echo "Migration finished."
echo "Now verifying WSL backup upload..."

PATH="$PROJECT_ROOT:$PATH" codex-recovery backup
PATH="$PROJECT_ROOT:$PATH" codex-recovery checkpoint "WSL CLI environment synced to GitHub and Supabase"
PATH="$PROJECT_ROOT:$PATH" codex-recovery restore-plan

echo ""
echo "WSL CLI Supabase sync completed."
