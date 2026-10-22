#!/usr/bin/env sh
set -eu

cd /opt/cloud-auth
mkdir -p data backups
chmod 700 data backups

test -f mira-cloud-auth-prod-image.tar.gz
gzip -t mira-cloud-auth-prod-image.tar.gz
gzip -dc mira-cloud-auth-prod-image.tar.gz | docker load >/dev/null

APP_UID="$(docker run --rm --entrypoint id mira-cloud-auth:prod -u)"
APP_GID="$(docker run --rm --entrypoint id mira-cloud-auth:prod -g)"
chown "$APP_UID:$APP_GID" data backups
chmod 700 data backups

# Take a consistent local snapshot before replacing an existing production container.
if docker compose -f docker-compose.prod.yml ps --status running --services 2>/dev/null | grep -qx cloud-auth; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "backups/$stamp"
  chown "$APP_UID:$APP_GID" "backups/$stamp"
  docker compose -f docker-compose.prod.yml exec -T     -e MIRA_AUTH_BACKUP_DIR="/backups/$stamp"     cloud-auth node scripts/backup.mjs
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

sh /opt/cloud-auth/scripts/install-caddy-prod-route.sh

curl -fsS http://127.0.0.1:8788/health
printf '\n'
docker compose -f docker-compose.prod.yml exec -T cloud-auth node scripts/benchmark-argon2.mjs 5
printf '%s\n' "${DEPLOY_SHA:-unknown}" > /opt/cloud-auth/.deployed-sha

# Reclaim the temporary test runtime budget. Keep the tiny data directory for forensic/reference use.
docker image rm mira-cloud-auth:test >/dev/null 2>&1 || true
rm -f /opt/cloud-auth-test/mira-cloud-auth-test-image.tar.gz
