#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

check_command() {
  local name="$1"
  if command -v "$name" >/dev/null 2>&1; then
    printf '%-10s %s\n' "$name" "$(command -v "$name")"
  else
    printf '%-10s %s\n' "$name" "not found"
  fi
}

echo "Codex Recovery WSL CLI installer"
echo "Project root: $PROJECT_ROOT"
echo ""
echo "Tool check:"
check_command git
check_command node
check_command npm
check_command pnpm
check_command python3
check_command gh
check_command codex

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "Node.js is required. Install Node.js, then rerun this script."
  exit 1
fi

echo ""
bash "$PROJECT_ROOT/scripts/register-command.sh"

echo ""
echo "Generating restore plan. This does not overwrite user configuration."
"$PROJECT_ROOT/codex-recovery" restore-plan

echo ""
echo "Done. Daily commands:"
echo "cd /mnt/d/Codex/WSL/workspace; codex"
echo "cd /mnt/d/Codex/WSL/workspace; codex-recovery resume"
