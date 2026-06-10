#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CLI_PATH="$PROJECT_ROOT/codex-recovery"
BASH_ALIASES="$HOME/.bash_aliases"
MARKER_BEGIN="# >>> codex-recovery wsl-cli >>>"
MARKER_END="# <<< codex-recovery wsl-cli <<<"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Install Node.js first."
  exit 1
fi

chmod +x "$CLI_PATH" "$PROJECT_ROOT/src/cli.js"
touch "$BASH_ALIASES"

if grep -Fq "$MARKER_BEGIN" "$BASH_ALIASES"; then
  echo "codex-recovery registration already exists in $BASH_ALIASES"
else
  {
    echo ""
    echo "$MARKER_BEGIN"
    echo "alias codex-recovery='$CLI_PATH'"
    echo "$MARKER_END"
  } >> "$BASH_ALIASES"
  echo "Registered codex-recovery in $BASH_ALIASES"
fi

echo "For this shell, run:"
echo "source $BASH_ALIASES"
