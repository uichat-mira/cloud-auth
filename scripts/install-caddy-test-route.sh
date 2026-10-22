#!/usr/bin/env sh
set -eu

SOURCE_DIR=${SOURCE_DIR:-/opt/cloud-auth-test}
CADDYFILE=${CADDYFILE:-/etc/caddy/Caddyfile}
SNIPPET=/etc/caddy/mira-cloud-auth-test.caddy
IMPORT_LINE="import /etc/caddy/mira-cloud-auth-test.caddy"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  SUDO="sudo"
else
  echo "Need root or passwordless sudo to update Caddy configuration" >&2
  exit 1
fi

test -f "$SOURCE_DIR/deploy/mira-cloud-auth-test.caddy"
$SUDO test -f "$CADDYFILE"

BACKUP="$CADDYFILE.before-cloud-auth-test"
$SUDO cp "$CADDYFILE" "$BACKUP"
$SUDO install -m 0644 "$SOURCE_DIR/deploy/mira-cloud-auth-test.caddy" "$SNIPPET"

if ! $SUDO grep -Fq "$IMPORT_LINE" "$CADDYFILE"; then
  printf '\n%s\n' "$IMPORT_LINE" | $SUDO tee -a "$CADDYFILE" >/dev/null
fi

if ! $SUDO caddy validate --config "$CADDYFILE" --adapter caddyfile; then
  $SUDO cp "$BACKUP" "$CADDYFILE"
  echo "Caddy validation failed; restored the previous configuration" >&2
  exit 1
fi

if command -v systemctl >/dev/null 2>&1 && $SUDO systemctl is-active --quiet caddy; then
  $SUDO systemctl reload caddy
else
  $SUDO caddy reload --config "$CADDYFILE" --adapter caddyfile
fi
