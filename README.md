# Mira Cloud Auth

Mira Cloud Auth is the shared identity service for Mira-operated cloud services.

Work item: [OPS-001](https://github.com/uichat-mira/cloud-auth/issues/1)
Canonical design: https://github.com/uichat-mira/.github/blob/main/docs/engineering/mira-cloud-auth.md
Phase III roadmap: https://github.com/uichat-mira/mira-desktop/issues/315

## V0 boundary

This service will own Mira Cloud Account, Mira Device, Cloud Session, and audience-bound service credential issuance.

It does not replace:
- Desktop or Mobile local identity;
- Local Provider credentials;
- Remote Host V1 pairing and business authorization;
- Shiyan-specific business authorization;
- Relay's transport-only boundary.

Local, Direct, and Tailscale product paths remain independent from Mira Cloud Auth.

## Repository layout

- `apps/api`: the Cloud Auth Fastify API package
- `pnpm-workspace.yaml` and `pnpm-lock.yaml`: authoritative workspace and lockfile

Run workspace commands from the repository root; API package-local source, tests, migrations, and runtime scripts live under `apps/api`.

## Bootstrap runtime

- Node.js 24 LTS + TypeScript
- Fastify
- SQLite WAL
- Docker / Docker Compose
- Caddy TLS/reverse proxy on the Mira self-managed server

OPS-001 intentionally provides only the service boundary, persistence/migration substrate, health/readiness, backup procedure, and CI/runtime evidence. Account/password, device lifecycle, and service credential behavior belong to follow-up work items.

## Development

1. pnpm install --frozen-lockfile
2. pnpm run check
3. pnpm run dev

The API default local database path is `./data/auth.sqlite` relative to `apps/api`.

## Endpoints

- GET /health: process liveness
- GET /ready: process + database readiness
- POST /v1/auth/login: account/password root authentication
- GET /v1/auth/session: restore accepted Cloud Session
- POST /v1/auth/session/renew: rotate/extend Cloud Session without resending password
- POST /v1/auth/logout: revoke current Cloud Session

See docs/auth-v0.md for the OPS-006 account/session contract and maintainer administration.
