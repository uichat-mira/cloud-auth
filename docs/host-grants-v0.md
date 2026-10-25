# Mira Cloud Host Grant V0 (OPS-020)

This document specifies the Cloud Auth Host grant authority for G2. It owns the
authoritative Host -> same-account Mobile capability ledger, the minimal
management API, and the bounded, verifiable snapshot that Desktop can cache
without asking Cloud Auth on every Tool call.

It does not execute Remote Gateway tools, implement Desktop login UI, implement
Portal UI, authorize Relay connections, or replace Remote V1 pairing for local
and Tailscale paths.

## Authority boundaries

Four authorities stay separate:

| Authority | Owner | Evidence |
| --- | --- | --- |
| Same-account device association | Cloud Auth | Active `devices` rows for the account |
| Cloud transport admission | Cloud Auth Relay ticket | `relay:transport` service credential and room ownership (OPS-019) |
| Host capability grant | Cloud Auth (this document) | Host policy, per-Mobile override, snapshot revision |
| Host Tool execution | Mira Desktop Gateway | Desktop's own Remote V1 scope checks (DSK-007) |

`relay:transport` is not a Host scope and can never become one. A Relay ticket
never confers Tool authority, and same-account membership alone grants no Tool
scope.

## Scope vocabulary

The only accepted scopes are the canonical Remote V1 paired-device scopes
persisted by Mira Desktop
(`server/src/db/repositories/tailscale-remote-access.repository.ts`, `REMOTE_DEVICE_SCOPES`):

```text
threads:read
messages:read
messages:write
agent:read
agent:approve
agent:control
tools:read
tools:invoke
tools:approve
tools:control
artifacts:read
```

Wildcards, `tools:*`, arbitrary strings, and `relay:transport` are rejected with
`400 HOST_GRANT_INVALID_REQUEST`. Scopes are deduplicated and stored in the order
above. There are no default Tool scopes: a Host without a configured policy
yields an empty snapshot.

## Model and effective grants

`host_grant_policies` stores one Desktop-owner ceiling per Host:

- `host_id`, `account_id`, canonical `policy_scopes`, monotonic `revision`,
  timestamps.

`host_mobile_grant_overrides` stores an optional per-Mobile narrowing or
revocation:

- `(host_id, mobile_device_id)`, `scopes`, `revoked_at`, `updated_at`.

Effective grants are deterministic:

| Host policy | Mobile override | Effective scopes |
| --- | --- | --- |
| Not configured | Any | none |
| Configured | Absent | Host policy ceiling |
| Configured | Active subset | Override subset |
| Configured | Revoked | none |

Mobile eligibility is derived from server state, never request metadata: the
Mobile `devices` row must belong to the Host's account, have
`platform = "mobile"`, and be non-revoked. A Mobile linked after the policy is
written inherits the policy ceiling automatically; there is no QR code, onsite
pairing, or second Desktop approval. The same account's Portal may narrow or
revoke an individual grant afterwards.

## Authorization matrix

| Action | Accepted caller |
| --- | --- |
| Set/update Host policy ceiling | The `mira-desktop` OAuth Cloud Session currently owning that Host (`desktop_hosts.session_id`), with an active desktop device and active account |
| Read Host snapshot | Active same-account Desktop or device-less account Portal Session; not Mobile |
| Read historical grant management view | Authenticated device-less account Portal Session |
| Read own Mobile grant | Active Cloud Session bound to a same-account, non-revoked Mobile device |
| Narrow/revoke one Mobile | Any active Cloud Session of the owning account |

For the policy write, the Desktop caller is verified inside the same
`BEGIN IMMEDIATE` transaction: session secret hash, expiry/revocation, account
admission, desktop device ownership/revocation, Host ownership and non-revocation,
and persisted `mira-desktop` OAuth provenance. A Mobile bearer, a Portal password
session, a device row that merely says `desktop`, or a caller-supplied account or
owner field cannot set the ceiling.

Cross-account Host or Mobile identifiers fail closed with `404`. A Portal call
can only narrow or revoke: it cannot exceed the Host ceiling or the currently
effective set, and it cannot resurrect a revoked override. Only the Desktop
owner can raise the ceiling, and raising it does not widen an already narrowed
override.

## HTTP contract

All endpoints use `Authorization: Bearer <Cloud Session>` and return JSON.

### Desktop owner sets the ceiling (DSK-005)

```http
PUT /v1/hosts/{hostId}/grant-policy
Content-Type: application/json
```

```json
{
  "expectedRevision": 0,
  "scopes": ["threads:read", "tools:read", "tools:invoke"]
}
```

```json
{
  "hostId": "host-uuid",
  "accountId": "account-uuid",
  "revision": 1,
  "scopes": ["threads:read", "tools:read", "tools:invoke"],
  "updatedAt": "2026-10-25T12:00:00.000Z"
}
```

`expectedRevision` starts at `0` when the Host has no policy. A stale value is
`409 HOST_GRANT_STALE_REVISION`; the caller must re-read the snapshot and retry.
Lowering the ceiling immediately intersects every existing override so no stored
Mobile grant can exceed it. A policy with `scopes: []` grants no Tool authority.

### Desktop sync snapshot (DSK-007)

```http
GET /v1/hosts/{hostId}/grants
```

```json
{
  "hostId": "host-uuid",
  "accountId": "account-uuid",
  "policyConfigured": true,
  "policyScopes": ["threads:read", "tools:read", "tools:invoke"],
  "revision": 4,
  "issuedAt": "2026-10-25T12:00:00.000Z",
  "validUntil": "2026-10-25T12:05:00.000Z",
  "maxStalenessSeconds": 300,
  "grants": [
    {
      "mobileDeviceId": "mobile-uuid",
      "scopes": ["threads:read", "tools:read"],
      "status": "active"
    },
    {
      "mobileDeviceId": "revoked-mobile-uuid",
      "scopes": [],
      "status": "revoked"
    }
  ]
}
```

`grants` is the complete set of currently active same-account Mobiles. A Mobile
absent from this array has no grant for this Host. A device that is revoked
disappears from the list; a Portal-revoked override remains visible with
`status: "revoked"` and no scopes. The snapshot contains device identifiers,
scopes, revision and times only. It never contains a Cloud password, Cloud
Session secret/token, OAuth authorization code, Relay ticket, Provider/MCP
secret, local filesystem path, or workspace content.

### Mobile reads its own effective grant

```http
GET /v1/hosts/{hostId}/grant
```

```json
{
  "hostId": "host-uuid",
  "accountId": "account-uuid",
  "mobileDeviceId": "mobile-uuid",
  "revision": 4,
  "scopes": ["threads:read", "tools:read"],
  "issuedAt": "2026-10-25T12:00:00.000Z",
  "validUntil": "2026-10-25T12:05:00.000Z",
  "maxStalenessSeconds": 300
}
```

A Desktop/Portal session, a foreign-account Mobile, a revoked Mobile, a revoked
Host, or a Portal-revoked grant fails closed.

### Portal narrows or revokes (OPS-021)

```http
PATCH /v1/hosts/{hostId}/grants/{mobileDeviceId}
Content-Type: application/json
```

```json
{
  "expectedRevision": 4,
  "scopes": ["threads:read"]
}
```

```json
{
  "hostId": "host-uuid",
  "mobileDeviceId": "mobile-uuid",
  "revision": 5,
  "scopes": ["threads:read"],
  "status": "active",
  "updatedAt": "2026-10-25T12:01:00.000Z"
}
```

`scopes` must be a subset of both the Host ceiling and the current effective
set. Anything wider is `403 HOST_GRANT_NOT_ALLOWED`.

```http
DELETE /v1/hosts/{hostId}/grants/{mobileDeviceId}?expectedRevision=5
```

```json
{
  "hostId": "host-uuid",
  "mobileDeviceId": "mobile-uuid",
  "revision": 6,
  "scopes": [],
  "status": "revoked",
  "updatedAt": "2026-10-25T12:02:00.000Z"
}
```

Repeating a revoke at the current revision is idempotent and does not bump the
revision. A stale `expectedRevision` is `409`.

## Revision and freshness contract

`revision` is the authoritative monotonic integer for one Host grant ledger. It
increments in the same SQLite transaction as every policy set, override
narrow/revoke, and Mobile registration/revocation that can change the snapshot.
A Desktop that sees a revision change must replace, not merge, its cached grant
set. Revisions are scoped per Host, not global.

`issuedAt`/`validUntil` are server-issued UTC ISO-8601 timestamps. The snapshot
TTL defaults to 300 seconds and is configurable with
`MIRA_AUTH_HOST_GRANT_SNAPSHOT_TTL_SECONDS` (reviewed range 30-3600 seconds).
`maxStalenessSeconds` equals the configured TTL and tells the consumer the
maximum accepted age.

Consumer rules (DSK-007):

1. Verify the response is authenticated by Cloud Auth over TLS and parse it with
   the published contract.
2. Match its own account, Host ID and the requesting Mobile device ID.
3. Accept a cached snapshot only until `validUntil`, and only while no newer
   revision was observed.
4. On failed refresh, invalid signature/shape, unknown Host/Mobile, expired
   `validUntil`, or a revision gap that cannot be resolved, fail closed: deny
   Tool invocation until a fresh snapshot is obtained.
5. Treat a Mobile absent from a fresh snapshot, or with `status: "revoked"` or
   empty scopes, as unauthorized.

This is an authenticated server response and cache contract, not a standalone
offline cryptographic signature. A client-editable JSON file or a copy without
a successful Cloud Auth TLS response is not valid proof. A Desktop that is
offline may continue only with a previously valid, unexpired snapshot; hard
revocation therefore takes effect no later than the configured TTL for such an
offline Host. This bounded window is intentional, not immediate offline
revocation.

Device revoke, Host revoke, logout, password change, account disable/deny, and
session expiry withdraw future snapshot/authority. The next snapshot attempt
fails closed; a cached snapshot still expires at `validUntil`. In particular,
a valid Portal or Mobile Session cannot renew a positive grant snapshot once
the Host-owning Desktop Session is revoked or expired, even if the Host device
row itself remains registered and non-revoked.

Host grant **policy** and per-Mobile overrides are durable account-owned state,
distinct from the current Host Session's authority to serve fresh snapshots.
An authenticated account owner may **still narrow or revoke** grants in Portal
while the Desktop Host is offline, logged out, or its session has expired,
including a Host row marked `host_session_revoked` by the logout trigger;
the stored grant revision advances, but no fresh positive snapshot can be
issued until the Desktop signs in and registers a valid Host Session. This
remote mutation does not require onsite Host approval and never widens authority.
A genuinely revoked Host device remains ineligible for grant mutations.

The Host-wide `/grants` snapshot contains sibling Mobile identities, so
Mobile OAuth Sessions receive `403 HOST_GRANT_NOT_ALLOWED` on that endpoint.
Mobiles read their own effective scopes only through `/grant`.

When the Desktop explicitly signs in again and successfully re-registers the
same still-approved Host, its previous policy and non-revoked, narrowed or
revoked Mobile overrides remain in effect; a new registration alone does not
widen scopes or undo Portal revocations. The Desktop login-stage scope UI
(DSK-005) must display the stored policy accurately rather than silently
asserting a new approval. Revoking the Host device instead makes all grants
ineligible even if historical policy rows remain.

## Storage and concurrency

Migration `007_host_grants.sql` adds the policy and override tables plus the
Mobile-registration/revocation revision triggers.

Each mutation re-reads session, account, device, Host and policy authority inside
one `BEGIN IMMEDIATE` transaction, checks `expectedRevision`, and writes state
before commit. A concurrent device revoke, logout, Host revoke, or competing
grant update cannot interleave between the final check and the write. Stale
writers receive `409`. The ledger stores no Cloud password, Cloud Session token
or secret, Host local paths, Provider credentials, MCP secrets, Relay ticket, or
workspace content.

## Errors

| Code | Status | Meaning |
| --- | --- | --- |
| `HOST_GRANT_INVALID_REQUEST` | 400 | Malformed body/path, unknown/wildcard scope, or bad revision parameter |
| `HOST_GRANT_REAUTH_REQUIRED` | 401 | Missing/expired/revoked Session or device |
| `HOST_GRANT_NOT_FOUND` | 404 | Unknown, foreign or revoked Host/Mobile |
| `HOST_GRANT_NOT_ALLOWED` | 403 | Caller cannot set the ceiling, widen a grant, or resurrect a revoked grant |
| `HOST_GRANT_STALE_REVISION` | 409 | `expectedRevision` does not match the current ledger |
| `HOST_GRANT_INTERNAL_ERROR` | 500 | Unexpected server failure |

## Verification

- T1 unit: canonical Desktop scope whitelist, default/override/revoked effective
  grant table, subset/intersection, bounded validity window.
- T2 Fastify inject: Desktop policy issuance, later-Mobile inheritance, Mobile
  self-grant, Portal narrowing/revocation, cross-account/foreign-Mobile
  rejection, unknown scope and stale revision, no secret leakage.
- T3 SQLite: policy revision across reopen, TTL window, newly linked Mobile,
  device revoke trigger/revision, stale writers across connections, lowered
  ceiling intersection, logout/Host/account-session revocation.
- `pnpm run check` is the repository gate.

## Deferred to other work items

- DSK-005 Desktop login-stage scope selection UI.
- DSK-007 Host Gateway Tool enforcement.
- OPS-021 Cloud Portal grant management UI.
- Live Remote V1 pairing migration, hardware attestation, cryptographic offline
  grant tokens, Hosted Relay connection changes, and any Tool execution.
- Reverse Mobile capability delegation or a general IAM/permission engine.
