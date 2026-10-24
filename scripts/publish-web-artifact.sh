#!/usr/bin/env sh
set -eu

IMAGE="${1:?usage: publish-web-artifact.sh <image> <target-directory>}"
TARGET_DIR="${2:?usage: publish-web-artifact.sh <image> <target-directory>}"
TARGET_PARENT="$(dirname "$TARGET_DIR")"
TMP_DIR="${TARGET_DIR}.next.$$"
PREVIOUS_DIR="${TARGET_DIR}.previous.$$"
CONTAINER_ID=""

cleanup() {
  if [ -n "$CONTAINER_ID" ]; then
    docker rm -f "$CONTAINER_ID" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}

rollback() {
  status=$?
  trap - EXIT HUP INT TERM
  cleanup
  if [ "$status" -ne 0 ] && [ ! -e "$TARGET_DIR" ] && [ -e "$PREVIOUS_DIR" ]; then
    mv "$PREVIOUS_DIR" "$TARGET_DIR" || true
  fi
  if [ "$status" -eq 0 ]; then
    rm -rf "$PREVIOUS_DIR"
  fi
  exit "$status"
}

trap rollback EXIT HUP INT TERM

mkdir -p "$TARGET_PARENT"
rm -rf "$TMP_DIR" "$PREVIOUS_DIR"
mkdir -p "$TMP_DIR"

CONTAINER_ID="$(docker create "$IMAGE")"
docker cp "$CONTAINER_ID:/app/apps/web/dist/." "$TMP_DIR/"
docker rm "$CONTAINER_ID" >/dev/null
CONTAINER_ID=""

test -s "$TMP_DIR/index.html"
grep -Fq "Mira Cloud Account" "$TMP_DIR/index.html"
find "$TMP_DIR" -type d -exec chmod 0755 {} \;
find "$TMP_DIR" -type f -exec chmod 0644 {} \;

if [ -e "$TARGET_DIR" ]; then
  mv "$TARGET_DIR" "$PREVIOUS_DIR"
fi
mv "$TMP_DIR" "$TARGET_DIR"

trap - EXIT HUP INT TERM
rm -rf "$PREVIOUS_DIR"
