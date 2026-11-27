# AGENTS.md

## Project identity

cloud-auth owns Mira Cloud Account, Mira Device, Cloud Session, and service-credential authentication boundaries for Mira-operated cloud services.

## Boundaries

- Keep the service contract deployment-neutral even though V0 deploys to the Mira self-managed server.
- Do not absorb Shiyan business authorization, Relay business semantics, Desktop local identity, Remote V1 authorization, Provider credentials, MCP secrets, or user content.
- Local/Direct/Tailscale product paths must not become dependent on this service.
- Keep persistence behind the storage boundary; SQLite WAL is the V0 implementation, not a client contract.
- Do not add public registration, OAuth, Passkeys, self-service recovery, Redis, PostgreSQL, or device proof-of-possession unless an authorized work item explicitly changes scope.

## Verification

Use pnpm run test:unit for T1.
Use pnpm run test:contract for T2.
Use pnpm run test:integration for T3.
Use pnpm run check as the fast repository gate.

Node ≥24 is required (pnpm 10 uses `node:sqlite`). If the default shell has Node 20, run
pnpm through `npx -y -p node@24.19.0 -p pnpm@10.34.7 pnpm <script>`; a bare
`npx pnpm@10.34.7` still uses the host Node. Run tests with `NODE_ENV=test`; the shell
exports `production`, which breaks React Testing Library.

## UI

Build web UI on the existing Mira Console system, not a parallel one. Read
[`docs/ui/design-system-reference.md`](docs/ui/design-system-reference.md) before adding
pages or primitives: navy `#151A2C` is the only action/focus/emphasis hue, UI surfaces are
black/white/gray, ivory `#FFF6ED` is brand-asset only, selected states reuse the hover wash, and new UI reuses the primitives in
`apps/web/src/components/ui/`.

`/docs` renders repository markdown directly through `apps/web/src/lib/docs/registry.ts` (`?raw`
imports, no copies). To publish a document, add it to the registry; update
`apps/web/src/lib/docs/markdown-links.ts` for new cross-document link shapes.
