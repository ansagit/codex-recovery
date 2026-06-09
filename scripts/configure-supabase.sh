#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="$HOME/.codex-recovery"
CONFIG_FILE="$CONFIG_DIR/supabase.json"

mkdir -p "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR"

printf "Paste Supabase project URL: "
IFS= read -r url

printf "Paste Supabase service_role / secret key: "
stty -echo
IFS= read -r key
stty echo
printf "\n"

url="${url%/}"

node - "$CONFIG_FILE" "$url" "$key" <<'NODE'
const fs = require("fs");
const [file, url, key] = process.argv.slice(2);

if (!url || !/^https:\/\/.+\.supabase\.co$/.test(url)) {
  console.error("Invalid Supabase URL. Expected: https://xxxx.supabase.co");
  process.exit(1);
}

if (!key || key.length < 20) {
  console.error("Invalid Supabase key. The key looks too short.");
  process.exit(1);
}

const data = {
  url,
  key,
  created_at: new Date().toISOString(),
  profile: "wsl-cli"
};

fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 });
NODE

chmod 600 "$CONFIG_FILE"

unset key

echo "Supabase config saved: $CONFIG_FILE"
echo "The key is stored locally only. Do not commit this file."
