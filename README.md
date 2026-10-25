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
- `apps/web`: the Mira Cloud Account web application (Vite + React + TypeScript)
- `packages/contracts`: browser-safe runtime contracts shared by clients
- `pnpm-workspace.yaml` and `pnpm-lock.yaml`: authoritative workspace and lockfile

Run workspace commands from the repository root; API package-local source, tests, migrations, and runtime scripts live under `apps/api`.

## Bootstrap runtime

- Node.js 24 LTS + TypeScript
- Fastify API + SQLite WAL
- Vite/React Account Portal
- Docker / Docker Compose
- Caddy TLS, API reverse proxy, and static SPA delivery on the Mira self-managed server

The web application is a separate Vite build providing the `/login`, `/account`, and not-found routes. The legacy embedded browser acceptance harness has been retired; use the real Portal for acceptance. Route components use a typed Cloud Auth client and session state layer; `apps/web/src/lib/auth` owns HTTP transport, contract validation, session persistence, and auth state so route components never handle bearer tokens directly.

OPS-001 intentionally provides only the service boundary, persistence/migration substrate, health/readiness, backup procedure, and CI/runtime evidence. Account/password, device lifecycle, and service credential behavior belong to follow-up work items.

## Deployment and operations

- [Cloud Auth 部署与排障指南（中文）](docs/deployment.md)：部署前检查、GitHub Actions 发布、Caddy 监听与 NAT、T5 验收、回滚及 2026-10-24 事故复盘。

## Development

1. pnpm install --frozen-lockfile
2. pnpm run check
3. pnpm run dev
4. pnpm run dev:web

The API default local database path is `./data/auth.sqlite` relative to `apps/api`. The web app starts through Vite at `http://localhost:5173`; use `pnpm run build` to produce its production bundle under `apps/web/dist`.

## Endpoints

- GET /health: process liveness
- GET /ready: process + database readiness
- POST /v1/auth/login: account/password root authentication with optional Mira Device context
- GET /v1/auth/session: restore accepted Cloud Session
- POST /v1/auth/session/renew: rotate/extend Cloud Session without resending password
- POST /v1/auth/password: change the authenticated account password and revoke all sessions
- POST /v1/auth/logout: revoke current Cloud Session
- GET /v1/oauth/authorize: issue a short-lived OAuth authorization code to a registered Desktop/Mobile callback (PKCE S256)
- POST /v1/oauth/token: redeem one authorization code + S256 verifier for a device-bound Cloud Session
- POST /v1/devices: register the current installation as a Mira Device
- GET /v1/devices: list the authenticated account's Mira Devices
- DELETE /v1/devices/:deviceId: revoke one owned Mira Device and its Cloud Sessions
- POST /v1/service-credentials: exchange a device-bound Cloud Session for one audience-bound short-lived service credential
- GET /.well-known/jwks.json: publish the active and retiring Ed25519 verification public keys

See docs/auth-v0.md for the OPS-006 account/session contract, the OPS-007 Mira Device lifecycle, and maintainer administration.

See docs/service-credentials-v0.md for the OPS-008 canonical claims, issuance endpoint, offline verification, signing configuration, trust assumptions, V0 key-overlap rotation, and remaining deferred work.

See docs/oauth-authorization-v0.md for the OPS-016 first-party client and callback registry, PKCE S256 authorization request/code contract, code storage, and the OPS-017 one-time device-bound token exchange.
