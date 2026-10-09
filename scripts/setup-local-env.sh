#!/bin/sh
# Creates the local env files from their templates and fills in generated secrets
# (database password, JWT signing key). Never prints a secret value.
# Safe to re-run: values that are already set are kept.
set -eu
cd "$(dirname "$0")/.."
umask 077 # new files are readable by the current user only

ROOT_ENV=.env
API_ENV=apps/api/.env
MOBILE_ENV=apps/mobile/.env

# set_if_empty FILE NAME VALUE — sets NAME=VALUE unless FILE already has a non-empty value.
set_if_empty() {
  file=$1 name=$2 value=$3
  if grep -q "^${name}=." "$file"; then
    echo "  kept      ${name} in ${file}"
    return
  fi
  if grep -q "^${name}=" "$file"; then
    tmp=$(mktemp)
    awk -v n="$name" -v v="$value" \
      'index($0, n "=") == 1 && !done { print n "=" v; done = 1; next } { print }' \
      "$file" >"$tmp"
    cat "$tmp" >"$file" # keeps the file's permissions
    rm -f "$tmp"
  else
    printf '%s=%s\n' "$name" "$value" >>"$file"
  fi
  echo "  generated ${name} in ${file}"
}

# get FILE NAME — prints NAME's value (used internally, never echoed to the terminal).
get() {
  sed -n "s/^$2=//p" "$1" | head -n 1
}

copy_template() {
  if [ ! -f "$1" ]; then
    cp "$1.example" "$1"
    echo "  created   $1"
  fi
  chmod 600 "$1"
}

echo "Setting up local env files…"
copy_template "$ROOT_ENV"
copy_template "$API_ENV"
copy_template "$MOBILE_ENV"

# Hex keeps generated values URL-safe (they go into DATABASE_URL).
set_if_empty "$ROOT_ENV" POSTGRES_PASSWORD "$(openssl rand -hex 24)"
set_if_empty "$API_ENV" JWT_SECRET "$(openssl rand -hex 48)"
set_if_empty "$API_ENV" DATABASE_URL \
  "postgresql://reelmark:$(get "$ROOT_ENV" POSTGRES_PASSWORD)@127.0.0.1:5432/reelmark"

if ! grep -q '^TMDB_ACCESS_TOKEN=.' "$API_ENV"; then
  echo "  ! TMDB_ACCESS_TOKEN is empty in ${API_ENV} — paste your TMDB API Read Access Token there."
fi
echo "Done. Secrets were written to git-ignored files and not displayed."
