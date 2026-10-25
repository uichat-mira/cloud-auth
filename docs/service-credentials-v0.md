# Mira Cloud Service Credentials V0

This document describes the implemented OPS-008 run 1 and run 2 scope: the canonical service-credential contract, isolated Ed25519 signing/offline verification helpers, authenticated device-bound issuance, public verifier discovery, and the V0 signing-key overlap strategy.

Full OPS-008 remains open. Cross-repository consumer implementation and production verification are intentionally not part of this repository change.

## Trust model

Cloud Session and service credentials are different layers:

1. `POST /v1/auth/login` (or device registration plus that session) establishes a revocable Cloud Session.
2. `POST /v1/service-credentials` exchanges a **device-bound** Cloud Session for one short-lived credential aimed at one explicit service audience.
3. The target service verifies the credential offline with Cloud Auth's published Ed25519 public keys. It never receives the user's password, the raw Cloud Session, or a universal bearer credential, and ordinary service requests do not call Cloud Auth.

A Cloud Session is accepted for credential issuance only when all of the following still hold at the final issuance boundary:

- the session id exists and its bearer secret hash matches;
- the session is not revoked and is not expired;
- the account is allowed and not disabled;
- `sessions.device_id` is non-null and refers to a device owned by the same account;
- that Mira Device is not revoked.

The authority check and signing happen inside one SQLite `BEGIN IMMEDIATE` transaction. Logout, session renewal, device revocation, account disable, and other writer operations cannot interleave between the final check and signing. A legacy Web session with `device_id IS NULL` remains valid for normal web login/restore/renewal but cannot obtain a service credential; it receives `403 SERVICE_CREDENTIAL_DEVICE_REQUIRED`.

The endpoint derives account id, device id, issuer, key id, and scope on the server. It never trusts client-supplied identity, issuer, key id, audience beyond the two supported values, or business permissions, and it never returns or forwards the original Cloud Session.

## Contract

### Issuer and audiences

| Field | Value |
| --- | --- |
| Issuer (`iss`) | `mira:cloud-auth` |
| Cloud Shiyan audience | `mira:cloud-shiyan` |
| Hosted Relay transport audience | `mira:cloud-relay-transport` |

The issuer is deployment-neutral. Services must configure the trusted issuer explicitly when verifying; they must never derive trust from the token's own `iss` claim.

The two audiences are intentionally non-interchangeable. A Shiyan verifier accepts only `mira:cloud-shiyan`; a Relay verifier accepts only `mira:cloud-relay-transport`. A valid credential for one service fails verification at the other.

### Scopes

Each audience has exactly one V0 least-privilege scope:

| Audience | Scope |
| --- | --- |
| `mira:cloud-shiyan` | `shiyan:authenticate` |
| `mira:cloud-relay-transport` | `relay:transport` |

These scopes assert only "Cloud Auth authenticated this account/device to this service" or "this is a transport connection ticket". They do not grant Shiyan business-resource authorization and do not grant Remote Host Browser, Terminal, Agent, Thread, tool, or other business capabilities.

Unsupported, missing, duplicate, cross-audience, or additional scopes are rejected by the canonical schema before any service consumes the claims.

### JWT header

The only accepted header is:

```json
{ "alg": "EdDSA", "typ": "JWT", "kid": "<bounded key id>" }
```

- `alg` is Ed25519 (`EdDSA`) only. `none`, HMAC, RSA, ECDSA, and other algorithms are rejected.
- `typ` must be `JWT`.
- `kid` is a bounded `[A-Za-z0-9._-]{1,64}` identifier.
- The verifier looks up `kid` only in an explicitly injected trusted key map. It never fetches keys over the network and never trusts `kid` as authority by itself.

### Claims

Shiyan credential:

```json
{
  "iss": "mira:cloud-auth",
  "sub": "<Mira Cloud account id>",
  "device_id": "<Mira Device id>",
  "aud": "mira:cloud-shiyan",
  "scope": ["shiyan:authenticate"],
  "iat": 1790000000,
  "nbf": 1790000000,
  "exp": 1790000300
}
```

Hosted Relay transport ticket:

```json
{
  "iss": "mira:cloud-auth",
  "sub": "<Mira Cloud account id>",
  "device_id": "<Mira Device id>",
  "aud": "mira:cloud-relay-transport",
  "scope": ["relay:transport"],
  "relay": {
    "room": "room-7f3a",
    "role": "client"
  },
  "iat": 1790000000,
  "nbf": 1790000000,
  "exp": 1790000300
}
```

- `sub` is the Mira Cloud account. `device_id` separately asserts the Mira Device that the credential was issued for.
- `iat`, `nbf`, and `exp` are JWT NumericDate seconds. The schema requires `nbf >= iat` and `exp > nbf`.
- Unknown claims are rejected by the strict schema.
- Relay `room` is a bounded transport identifier and `role` is `client` or `host`. These are transport peer semantics only; the ticket cannot encode or imply Host tool or business authorization.
- Ticket expiry gates establishing a new connection with that ticket. It does not by itself require terminating an already-established Relay WebSocket; connection lifecycle remains Relay-owned.

## HTTP API

### POST /v1/service-credentials

Requires `Authorization: Bearer <Cloud Session>` for a device-bound, non-revoked session.

Shiyan request:

```json
{ "audience": "mira:cloud-shiyan" }
```

Hosted Relay request:

```json
{
  "audience": "mira:cloud-relay-transport",
  "relay": { "room": "room-7f3a", "role": "client" }
}
```

Success returns only the short-lived credential and necessary metadata:

```json
{
  "token": "<compact EdDSA JWS>",
  "tokenType": "Bearer",
  "audience": "mira:cloud-shiyan",
  "expiresAt": "2026-10-24T10:05:00.000Z"
}
```

Error codes:

| Status | Code |
| --- | --- |
| 400 | `SERVICE_CREDENTIAL_INVALID_REQUEST` |
| 401 | `SERVICE_CREDENTIAL_REAUTH_REQUIRED` |
| 403 | `SERVICE_CREDENTIAL_DEVICE_REQUIRED` |
| 503 | `SERVICE_CREDENTIAL_UNAVAILABLE` |
| 500 | `SERVICE_CREDENTIAL_INTERNAL_ERROR` |

A missing or malformed bearer, unknown session, expired session, revoked session, rotated-away old session secret, revoked device, disabled account, or denied account all return `401 SERVICE_CREDENTIAL_REAUTH_REQUIRED` without leaking which check failed.

### GET /.well-known/jwks.json

Returns only trusted Ed25519 public verification keys:

```json
{
  "keys": [
    {
      "kty": "OKP",
      "crv": "Ed25519",
      "use": "sig",
      "alg": "EdDSA",
      "kid": "cloud-auth-2026-10",
      "x": "<base64url public key>"
    }
  ]
}
```

The response is cacheable for 300 seconds in V0. It contains the active signing key first, followed by configured **verification-only public keys** (old retiring keys or the future key pre-published before rotation). The existing configuration field is named `RETIRING_PUBLIC_KEYS` for compatibility; it may temporarily hold the **next public key** during the pre-publication phase. It never contains private key material. When signing/verification material is not fully configured, credential issuance and JWKS return `503 SERVICE_CREDENTIAL_UNAVAILABLE`.

## Signing configuration

Signing material is injected explicitly from deployment configuration; it is never read from token contents, committed repository files, or host credentials. Environment variables:

| Variable | Purpose |
| --- | --- |
| `MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_KID` | Active signing key id. |
| `MIRA_AUTH_SERVICE_CREDENTIAL_ACTIVE_PRIVATE_KEY` | Active Ed25519 private key PEM. Secret. Never logged or returned. |
| `MIRA_AUTH_SERVICE_CREDENTIAL_RETIRING_PUBLIC_KEYS` | JSON object of verification-only Ed25519 **public** PEMs. Use for old retiring keys and for the next key's public half during pre-publication. Private PEMs are rejected. |
| `MIRA_AUTH_SERVICE_CREDENTIAL_TTL_SECONDS` | Optional TTL, default 300, maximum 600. |

PEM values may use real newlines or escaped `\n` sequences from environment files. If these variables are absent, or if any supplied key id / PEM / TTL / JSON value is invalid, service-credential issuance and JWKS fail closed. This does **not** disable account login, `/health`, `/ready`, device management, or the web application. Invalid configuration is reported only as `SERVICE_CREDENTIAL_UNAVAILABLE`.

No production private key, real key id, or deployment secret is committed by this repository.

## Verification

Implementation:

- `apps/api/src/service-credentials/signer.ts`
- `apps/api/src/service-credentials/verifier.ts`
- `apps/api/src/service-credentials/keyring.ts`
- `apps/api/src/service-credentials/service.ts`
- `apps/api/src/service-credentials/routes.ts`
- `apps/api/src/service-credentials/jwt.ts`
- `packages/contracts/src/service-credential.ts` (browser-safe canonical schemas and literals)

Verification is offline and fail-closed. It rejects:

- a token that is not a three-segment compact JWS;
- a malformed header, any algorithm other than `EdDSA`, any `typ` other than `JWT`, or an invalid `kid`;
- a `kid` absent from the explicitly trusted key map;
- an invalid, unsigned, or modified signature;
- claims that do not satisfy the strict canonical schema;
- an issuer other than the explicitly configured trusted issuer;
- an audience other than the verifier's single configured audience;
- missing or unexpected scope;
- `iat` in the future, `nbf` not yet reached, `exp` passed, or lifetime above the verifier limit;
- a Relay verifier that omits the expected room/role, or a ticket whose room or role does not match that connection context;
- an invalid verifier clock, so expiry cannot be checked safely.

A Relay consumer must pass the actual expected room and role when accepting a connection. Omitting that context fails with `INVALID_VERIFIER_CONFIG` rather than checking only ticket structure. The Relay service remains responsible for its own transport connection lifecycle and any further business authorization.

### Consumer checklist

Consumers should share the canonical literals/schemas from `@uichat-mira/cloud-auth-contracts` rather than redefining claim names, audiences, scopes, or header rules. A verification integration has this shape:

```ts
// Shiyan: accept only the Shiyan audience and its one scope.
const shiyan = verifyServiceCredential(credential, {
  issuer: SERVICE_CREDENTIAL_ISSUER,
  audience: CLOUD_SHIYAN_AUDIENCE,
  publicKeys: trustedKeysFromJwks, // explicit, from the trusted JWKS URL/cache
});

// Relay: additionally bind the ticket to the actual transport connection.
const relay = verifyServiceCredential(connectionCredential, {
  issuer: SERVICE_CREDENTIAL_ISSUER,
  audience: CLOUD_RELAY_TRANSPORT_AUDIENCE,
  publicKeys: trustedKeysFromJwks,
  expectedRelay: { room: actualRequestedRoom, role: actualPeerRole },
});
```

The tests under `apps/api/tests/contract` and `apps/api/tests/integration` are the executable examples for both audiences, including negative cases. They generate ephemeral Ed25519 key pairs at test time; no key material is committed.

## Lifetime and revocation limitation

The default TTL is 300 seconds; the maximum issuance and verification lifetime is 600 seconds. These are reviewed V0 implementation bounds, not permanent product truth.

Revoking an account, device, or Cloud Session stops **future issuance**. An already-issued service credential remains verifiable until its `exp` unless a consumer adds an explicit online revocation check. V0 bounds this exposure with short lifetimes; production TTL selection must account for this remaining-lifetime risk and is still a maintainer decision.

## V0 key rotation

`kid` is carried in the JWT header; only the active key signs new credentials. To avoid rejecting newly issued credentials on a consumer holding a still-valid cached JWKS, **pre-publish the new public key before activating its private key**. The V0 procedure uses the existing `RETIRING_PUBLIC_KEYS` field for public verification-only keys in **both** directions:

1. Generate the new Ed25519 pair outside this repository. Keep the **old** active private key/signing `kid` unchanged. Add **only the new public key** under its future `kid` to `MIRA_AUTH_SERVICE_CREDENTIAL_RETIRING_PUBLIC_KEYS` and deploy this JWKS pre-publication phase.
2. Confirm the updated JWKS with **both public keys** is reachable on every serving instance. Wait at least the published **300-second cache lifetime plus deployment propagation** so consumers with a previously cached old-only JWKS can refresh before any new-`kid` credentials are issued. Do not advance while an old-only JWKS response can still be served.
3. Switch `ACTIVE_KID` / `ACTIVE_PRIVATE_KEY` to the **new** pair; keep the **old public key** in `RETIRING_PUBLIC_KEYS`. New tokens use the new `kid`, while both the pre-switch cached JWKS and the new JWKS verify either key. If the switch is rolled back, keep both public keys published throughout the rollback and its cache window.
4. Once the last old-key token could have expired, allow at least the maximum **600-second token lifetime**, the **300-second JWKS cache lifetime**, and deployment propagation after the last old signature / old-only JWKS response. Then remove the old public key and deploy. Consumers must refresh JWKS on its cache schedule; an unknown `kid` must fail verification, never fall back to another key.

The unit rotation test constructs a cached pre-switch JWKS, signs tokens with both old and new active keys, verifies both with cached and refreshed key sets, and confirms the old key becomes unknown after retirement. **Never place any private PEM in the verification-only list; config containing a private PEM fails closed.** This repository does not rotate production keys or control consumer caches; the real SHY/REL deployment rollout and cache verification remain required before production promotion.

## Not implemented

- Real production key generation, secret provisioning, deployment, or rotation.
- Changes to Cloud Shiyan, hosted Relay, Desktop, or Mobile repositories.
- Mobile/Desktop credential-acquisition UI or wiring.
- Shiyan business-resource authorization.
- Relay WebSocket frame authorization or Remote Host Browser/Terminal/Agent/Thread capabilities.
- Per-request Cloud Auth introspection or online revocation checks by consumers.
- Universal service tokens.
- Public registration, OAuth, Passkeys, self-service recovery, Redis, PostgreSQL, hardware identifiers, or device proof-of-possession.

Cross-repository consumer implementation and evidence from SHY-001 and REL-001 remain required before production promotion.
