#!/usr/bin/env sh
set -eu

cd /opt/cloud-auth
mkdir -p data backups
chmod 700 data backups

test -f mira-cloud-auth-prod-image.tar.gz
gzip -t mira-cloud-auth-prod-image.tar.gz
gzip -dc mira-cloud-auth-prod-image.tar.gz | docker load >/dev/null

# REL-005: provision one durable, host-only Ed25519 signer. Never print, commit,
# regenerate on ordinary releases, or store its PEM in a GitHub Actions secret.
# The directory is outside the repository, web root, and SQLite backup volume.
SIGNING_DIR=/opt/cloud-auth/secrets/service-credential-v0
if [ ! -d "$SIGNING_DIR" ]; then
  umask 077
  mkdir -p /opt/cloud-auth/secrets
  chmod 700 /opt/cloud-auth/secrets
  STAGING_DIR="$(mktemp -d /opt/cloud-auth/secrets/.service-credential-v0.XXXXXXXX)"
  docker run --rm --entrypoint node mira-cloud-auth:prod -e \
    "const {generateKeyPairSync}=require('node:crypto');process.stdout.write(generateKeyPairSync('ed25519').privateKey.export({type:'pkcs8',format:'pem'}))" \
    > "$STAGING_DIR/active.pem"
  docker run --rm --entrypoint node mira-cloud-auth:prod -e \
    "process.stdout.write('rel005-'+require('node:crypto').randomBytes(12).toString('hex'))" \
    > "$STAGING_DIR/active.kid"
  test -s "$STAGING_DIR/active.pem"
  test -s "$STAGING_DIR/active.kid"
  chmod 600 "$STAGING_DIR/active.pem" "$STAGING_DIR/active.kid"
  mv "$STAGING_DIR" "$SIGNING_DIR"
fi
# A partial/corrupted existing key is a release failure, never a rotation trigger.
test -s "$SIGNING_DIR/active.pem"
test -s "$SIGNING_DIR/active.kid"
test "$(stat -c %a "$SIGNING_DIR/active.pem")" = 600
# Validate persisted material *before* any backup, stop or container recreation.
# No PEM enters command arguments, logs, or a network-enabled validator.
docker run --rm --network none --user 0:0 \
  --mount "type=bind,src=$SIGNING_DIR,dst=/signing,readonly" \
  --entrypoint node mira-cloud-auth:prod -e '
const fs = require("node:fs");
const { createPrivateKey } = require("node:crypto");
const kid = fs.readFileSync("/signing/active.kid", "utf8").trim();
if (!/^[A-Za-z0-9._-]{1,64}$/.test(kid)) process.exit(1);
try {
  const key = createPrivateKey(fs.readFileSync("/signing/active.pem", "utf8"));
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") process.exit(1);
} catch {
  process.exit(1);
}
'
export MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_KID="$(cat "$SIGNING_DIR/active.kid")"
export MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_PRIVATE_KEY="$(cat "$SIGNING_DIR/active.pem")"

APP_UID="$(docker run --rm --entrypoint id mira-cloud-auth:prod -u)"
APP_GID="$(docker run --rm --entrypoint id mira-cloud-auth:prod -g)"
chown "$APP_UID:$APP_GID" data backups
chmod 700 data backups

# Take a consistent local snapshot before replacing an existing production container.
if docker compose -f docker-compose.prod.yml ps --status running --services 2>/dev/null | grep -qx cloud-auth; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "backups/$stamp"
  chown "$APP_UID:$APP_GID" "backups/$stamp"
  docker compose -f docker-compose.prod.yml exec -T \
    -e MIRA_AUTH_BACKUP_DIR="/backups/$stamp" \
    cloud-auth node scripts/backup.mjs
fi

# The production service owns loopback port 8788. Stop the temporary test service first.
if [ -f /opt/cloud-auth-test/docker-compose.test.yml ]; then
  docker compose -f /opt/cloud-auth-test/docker-compose.test.yml down --remove-orphans || true
fi

docker compose -f docker-compose.prod.yml up -d --force-recreate --remove-orphans

attempt=0
until curl -fsS http://127.0.0.1:8788/ready >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    docker compose -f docker-compose.prod.yml logs --tail=200
    exit 1
  fi
  sleep 1
done

# A healthy login API is not proof that service credentials can be issued.
# Verify the actual local Ed25519 public JWKS before exposing the new route.
curl -fsS http://127.0.0.1:8788/.well-known/jwks.json | python3 -c '
import json, sys
jwks = json.load(sys.stdin)
keys = jwks.get("keys")
assert isinstance(keys, list) and len(keys) >= 1, "missing public JWKS keys"
assert all(k.get("kty") == "OKP" and k.get("crv") == "Ed25519" and k.get("alg") == "EdDSA" and isinstance(k.get("kid"), str) and k.get("x") and "d" not in k for k in keys), "invalid public key"
'

sh /opt/cloud-auth/scripts/publish-web-artifact.sh mira-cloud-auth:prod /opt/cloud-auth/web
sh /opt/cloud-auth/scripts/install-caddy-prod-route.sh

curl -fsS http://127.0.0.1:8788/health
printf '\n'
test -s /opt/cloud-auth/web/index.html
grep -Fq "Mira Cloud Account" /opt/cloud-auth/web/index.html
docker compose -f docker-compose.prod.yml exec -T cloud-auth node scripts/benchmark-argon2.mjs 5
printf '%s\n' "${DEPLOY_SHA:-unknown}" > /opt/cloud-auth/.deployed-sha

# Reclaim the temporary test runtime budget. Keep the tiny data directory for forensic/reference use.
docker image rm mira-cloud-auth:test >/dev/null 2>&1 || true
rm -f /opt/cloud-auth-test/mira-cloud-auth-test-image.tar.gz
