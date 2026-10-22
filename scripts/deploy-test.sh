#!/usr/bin/env sh
set -eu

cd /opt/cloud-auth-test
mkdir -p data backups
chmod 700 data backups

test -f mira-cloud-auth-test-image.tar.gz
gzip -t mira-cloud-auth-test-image.tar.gz
gzip -dc mira-cloud-auth-test-image.tar.gz | docker load >/dev/null

APP_UID="$(docker run --rm --entrypoint id mira-cloud-auth:test -u)"
APP_GID="$(docker run --rm --entrypoint id mira-cloud-auth:test -g)"
chown "$APP_UID:$APP_GID" data
chmod 700 data

docker compose -f docker-compose.test.yml up -d --force-recreate --remove-orphans

attempt=0
until curl -fsS http://127.0.0.1:8788/ready >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    docker compose -f docker-compose.test.yml logs --tail=200
    exit 1
  fi
  sleep 1
done

sh /opt/cloud-auth-test/scripts/install-caddy-test-route.sh

curl -fsS http://127.0.0.1:8788/health
printf '\n'
docker compose -f docker-compose.test.yml exec -T cloud-auth node scripts/benchmark-argon2.mjs 5
printf '%s\n' "${DEPLOY_SHA:-unknown}" > /opt/cloud-auth-test/.deployed-sha
