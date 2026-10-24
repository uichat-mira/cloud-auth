# Deployment

Cloud Auth V0 targets the Mira self-managed server.

## Runtime

- Docker / Docker Compose
- Node.js 24 LTS inside the image
- SQLite WAL on a persistent Docker volume
- Caddy terminates TLS and reverse-proxies to the loopback-published application port
- ordinary application memory target: roughly 100–200 MiB
- Compose hard memory ceiling: 512 MiB
- one CPU is sufficient for bootstrap; later password hashing must have bounded concurrency and rate limiting

## Server access

Deployment automation should reuse the Organization-level Actions configuration already used by Mira infrastructure:

- DEPLOY_HOST
- DEPLOY_USER
- DEPLOY_PASSWORD
- DEPLOY_PORT
- MIRA_DEPLOY_ENABLED

These values describe how automation reaches the shared Mira server. Service-specific authentication/signing secrets must remain scoped to cloud-auth, preferably its production GitHub Environment.

## Server layout

Use an isolated service directory such as /opt/cloud-auth.

Do not share the SQLite file or service-specific secrets with another Mira service.

## Caddy and environment naming

The canonical long-lived production host is:

`https://cloud-auth.tomzlab.cn`

The reserved test hostname is:

`https://test.cloud-auth.tomzlab.cn`

To conserve the 2 vCPU / 2 GiB host budget, test is **not** an always-on second Cloud Auth instance. Test deployment is manual and temporary when environment acceptance is required. Production is the only long-lived Cloud Auth container.

Caddy terminates TLS and reverse-proxies the production hostname to `127.0.0.1:8788`.

## Closed-pilot account administration

OPS-006 exposes no public admin HTTP endpoint. After the image is built, maintainers administer the account database from the service runtime:

```bash
read -s MIRA_PASSWORD
printf '%s' "$MIRA_PASSWORD" | docker compose exec -T cloud-auth node dist/admin-cli.js provision pilot
unset MIRA_PASSWORD
```

The same CLI provides `reset-password`, `allow`, `deny`, `enable`, and `disable`.

Run `pnpm run benchmark:argon2 5` (or `node scripts/benchmark-argon2.mjs 5` inside the Node 24 runtime) on the target server before production promotion. The initial configuration starts at Argon2id m=19456 KiB, t=2, p=1; target-server evidence may justify tuning upward but must not silently lower the reviewed V0 floor.

## Backup

The runtime image contains scripts/backup.mjs. Create a consistent SQLite snapshot inside the running container:

docker compose exec -T -e MIRA_AUTH_BACKUP_DIR=/data/backups cloud-auth node scripts/backup.mjs

The command prints the snapshot path. Copy that file from the container/volume to the server backup staging directory, then transfer it to the approved external/object-storage target with infrastructure-owned credentials and retention policy.

SQLite VACUUM INTO creates the consistent snapshot. Object-storage credentials must not be embedded in the application image or repository.

## Promotion

Repository environments follow `feat/* -> dev -> test -> prod`.

Production uses a fresh production SQLite database under `/opt/cloud-auth/data`; test data is never copied into production.

The production deploy stops the temporary test container before binding production to loopback port 8788 and removes the former `mira-ai.tomzlab.cn/cloud-auth-test/` Caddy import/snippet. The small test data directory may remain for forensic/reference use, but it consumes no running CPU/RAM.

The browser acceptance harness is disabled in production (`MIRA_AUTH_ACCEPTANCE_UI=false`). Cloud Auth production is an API service consumed by Mira clients, not an administrator web console.

GitHub-hosted runners may experience source-dependent ingress resets against the mainland server. Therefore server-local `/ready`, `/health`, successful Caddy validation/reload, and target-server Argon2 benchmark are hard deployment evidence; runner-origin public HTTPS smoke is advisory and browser reachability is checked separately.

Production promotion/deployment requires explicit maintainer authority. OPS-006 received that authority on 2026-10-22.
