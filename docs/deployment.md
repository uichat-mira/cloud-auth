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

## Caddy

The public hostname is intentionally not frozen by OPS-001. Use deploy/Caddyfile.example and route the chosen hostname to 127.0.0.1:8788.

## Closed-pilot account administration

OPS-006 exposes no public admin HTTP endpoint. After the image is built, maintainers administer the account database from the service runtime:

```bash
read -s MIRA_PASSWORD
printf '%s' "$MIRA_PASSWORD" | docker compose exec -T cloud-auth node dist/admin-cli.js provision pilot
unset MIRA_PASSWORD
```

The same CLI provides `reset-password`, `allow`, `deny`, `enable`, and `disable`.

Run `npm run benchmark:argon2 -- 5` (or the equivalent command inside the Node 24 runtime) on the target server before production promotion. The initial configuration starts at Argon2id m=19456 KiB, t=2, p=1; target-server evidence may justify tuning upward but must not silently lower the reviewed V0 floor.

## Backup

The runtime image contains scripts/backup.mjs. Create a consistent SQLite snapshot inside the running container:

docker compose exec -T -e MIRA_AUTH_BACKUP_DIR=/data/backups cloud-auth node scripts/backup.mjs

The command prints the snapshot path. Copy that file from the container/volume to the server backup staging directory, then transfer it to the approved external/object-storage target with infrastructure-owned credentials and retention policy.

SQLite VACUUM INTO creates the consistent snapshot. Object-storage credentials must not be embedded in the application image or repository.

## Promotion

Repository environments follow feat/* -> dev -> test -> prod.

OPS-001 does not authorize a production deployment. Deployment/promotion requires its own explicit authority and environment evidence.
