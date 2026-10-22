#!/usr/bin/env sh
set -eu

SOURCE_DIR=${SOURCE_DIR:-/opt/cloud-auth-test}
CADDYFILE=${CADDYFILE:-/etc/caddy/Caddyfile}
SNIPPET=/etc/caddy/mira-cloud-auth-test.caddy
IMPORT_LINE="    import /etc/caddy/mira-cloud-auth-test.caddy"
SITE="mira-ai.tomzlab.cn"

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

$SUDO cp "$CADDYFILE" "$CADDYFILE.before-cloud-auth-test"
$SUDO install -m 0644 "$SOURCE_DIR/deploy/mira-cloud-auth-test.caddy" "$SNIPPET"

if ! $SUDO grep -Fq "$IMPORT_LINE" "$CADDYFILE"; then
  $SUDO python3 - "$CADDYFILE" "$SITE" "$IMPORT_LINE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
site = sys.argv[2]
import_line = sys.argv[3]
lines = path.read_text().splitlines()

matches = [index for index, line in enumerate(lines) if line.strip() == f"{site} {{"]
if len(matches) != 1:
    raise SystemExit(f"Expected exactly one {site} site block, found {len(matches)}")

index = matches[0] + 1
lines.insert(index, import_line)
path.write_text("\n".join(lines) + "\n")
PY
fi

$SUDO caddy validate --config "$CADDYFILE" --adapter caddyfile

if command -v systemctl >/dev/null 2>&1 && $SUDO systemctl is-active --quiet caddy; then
  $SUDO systemctl reload caddy
else
  $SUDO caddy reload --config "$CADDYFILE" --adapter caddyfile
fi
