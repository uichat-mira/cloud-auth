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

## Bootstrap runtime

- Node.js 24 LTS + TypeScript
- Fastify
- SQLite WAL
- Docker / Docker Compose
- Caddy TLS/reverse proxy on the Mira self-managed server

OPS-001 intentionally provides only the service boundary, persistence/migration substrate, health/readiness, backup procedure, and CI/runtime evidence. Account/password, device lifecycle, and service credential behavior belong to follow-up work items.

## Deployment and operations

- [Cloud Auth 部署与排障指南（中文）](docs/deployment.md)：部署前检查、GitHub Actions 发布、Caddy 监听与 NAT、T5 验收、回滚及 2026-10-24 事故复盘。

## Development

1. npm ci
2. npm run check
3. npm run dev

Default local database path is ./data/auth.sqlite.

## Endpoints

- GET /health: process liveness
- GET /ready: process + database readiness
- POST /v1/auth/login: account/password root authentication
- GET /v1/auth/session: restore accepted Cloud Session
- POST /v1/auth/session/renew: rotate/extend Cloud Session without resending password
- POST /v1/auth/logout: revoke current Cloud Session

See docs/auth-v0.md for the OPS-006 account/session contract and maintainer administration.
