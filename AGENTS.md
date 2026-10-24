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
