#!/usr/bin/env sh
set -eu

SOURCE_DIR=${SOURCE_DIR:-/opt/cloud-auth}
CADDYFILE=${CADDYFILE:-/etc/caddy/Caddyfile}
PROD_SNIPPET=/etc/caddy/mira-cloud-auth.caddy
TEST_SNIPPET=/etc/caddy/mira-cloud-auth-test.caddy
PROD_IMPORT="import /etc/caddy/mira-cloud-auth.caddy"
TEST_IMPORT="import /etc/caddy/mira-cloud-auth-test.caddy"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  SUDO="sudo"
else
  echo "Need root or passwordless sudo to update Caddy configuration" >&2
  exit 1
fi

test -f "$SOURCE_DIR/deploy/mira-cloud-auth-prod.caddy"
$SUDO test -f "$CADDYFILE"

BACKUP="$CADDYFILE.before-cloud-auth-prod"
$SUDO cp "$CADDYFILE" "$BACKUP"
$SUDO install -m 0644 "$SOURCE_DIR/deploy/mira-cloud-auth-prod.caddy" "$PROD_SNIPPET"

$SUDO python3 - "$CADDYFILE" "$PROD_IMPORT" "$TEST_IMPORT" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
prod_import = sys.argv[2]
test_import = sys.argv[3]
lines = path.read_text().splitlines()

# Remove the former test-only import wherever it lived.
lines = [line for line in lines if line.strip() != test_import]

# The production snippet owns its complete site block, so import it at top level.
if not any(line.strip() == prod_import for line in lines):
    if lines and lines[-1].strip():
        lines.append("")
    lines.append(prod_import)

path.write_text("\n".join(lines) + "\n")
PY

if ! $SUDO caddy validate --config "$CADDYFILE" --adapter caddyfile; then
  $SUDO cp "$BACKUP" "$CADDYFILE"
  echo "Caddy validation failed; restored the previous configuration" >&2
  exit 1
fi

$SUDO rm -f "$TEST_SNIPPET"

if command -v systemctl >/dev/null 2>&1 && $SUDO systemctl is-active --quiet caddy; then
  $SUDO systemctl reload caddy
else
  $SUDO caddy reload --config "$CADDYFILE" --adapter caddyfile
fi
