# Mira Cloud Service Credentials V0 (Run 1 core)

This document describes the implemented OPS-008 run 1 scope: the canonical service-credential claims contract plus isolated Ed25519 signing and offline verification helpers. It is **not** a public issuance API and does not yet integrate Cloud Sessions, devices, persistence, key provisioning, or JWKS discovery.

Full OPS-008 remains open. The deferred surfaces are listed at the end of this document.

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
- `kid` is a bounded `[A-Za-z0-9._-]{1,64}` identifier. It is used for future rotation but is not independently trusted.
- The verifier looks up `kid` only in an explicitly injected trusted key map. It never fetches keys over the network.

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

## Signing and verification helpers

Implementation:

- `apps/api/src/service-credentials/signer.ts`
- `apps/api/src/service-credentials/verifier.ts`
- `apps/api/src/service-credentials/jwt.ts`
- `packages/contracts/src/service-credential.ts` (browser-safe canonical schemas and literals)

### Key injection

Keys are accepted only as explicit caller inputs:

- signer: injected Ed25519 private `KeyObject`, PEM string, or key buffer;
- verifier: an injected trusted map of `kid` to Ed25519 public key.

The helpers never read environment variables, files, secrets, host credentials, or default literal keys. Tests generate ephemeral key pairs locally; no key material is committed.

### Bound-short lifetime

- The run 1 default issuance TTL is 300 seconds.
- The run 1 maximum issuance and verification lifetime is 600 seconds.
- These are reviewed V0 implementation bounds, not permanent product truth. Consumers must not treat them as a product SLA.
- Verifier clock skew defaults to zero and may be configured up to 60 seconds.

### Fail-closed verification

Verification rejects a credential when:

- the token is not a three-segment compact JWS;
- the header is malformed or uses any algorithm other than `EdDSA`, any `typ` other than `JWT`, or an invalid `kid`;
- the `kid` is not present in the explicitly trusted key map;
- the signature is invalid, unsigned, or the payload was modified;
- the payload does not satisfy the strict canonical claims schema;
- the issuer does not equal the explicitly configured trusted issuer;
- the audience does not equal the verifier's single configured audience;
- the scope is missing or unexpected (schema rejection);
- `iat` is in the future, `nbf` is not yet reached, `exp` has passed, or the lifetime exceeds the verifier limit;
- a Relay verifier omits the required expected room/role, or the ticket's room or role does not match that connection context;
- the verifier is given an invalid clock value (including an invalid Date), so expiry cannot be checked safely.

Verification does not trust token-declared `alg`, `kid`, issuer, audience, or scope as authority, and does not fetch keys or call Cloud Auth. A Relay consumer must pass the expected room and role when accepting a connection; omitting them fails closed with `INVALID_VERIFIER_CONFIG` rather than only checking the ticket's structure.

## Revocation limitation

These are offline verifiers of short-lived credentials. Revoking an account, device, or Cloud Session stops **future issuance** once authenticated issuance exists, but an already-issued credential remains verifiable until its `exp` unless a consumer adds an explicit online revocation check.

V0 therefore bounds this exposure with short lifetimes. Choosing production TTLs is explicitly deferred and must account for this remaining-lifetime risk.

## Rotation status

`kid` is present so the contract can support rotation later. **Rotation is not implemented in run 1.** There is no overlapping key publication, no active/retiring key selection, no verifier discovery, and no migration procedure. The verifier already accepts a trusted key map so that a later reviewed rotation design can inject overlapping keys without changing the token format.

## Not implemented in run 1

- Public issuer HTTP endpoint.
- `Authorization: Bearer <Cloud Session>` validation for issuance.
- Account/device/session authority checks, including OPS-007 device revocation and the `device_id = NULL` legacy-session policy.
- Fastify/SQLite issuance metadata, key selection persistence, or T2/T3 HTTP integration.
- JWKS or any public verifier-discovery endpoint.
- Environment-aware signing-key provisioning, key storage, rotation, overlap, or retirement.
- Canonical fixture files for external repositories. The canonical schemas and literals are exported from `packages/contracts` for those consumers; fixture publication follows with real issuance.
- Changes to SHY-001 or REL-001, client apps, frontend UI, production secrets, or deployments.

## Run 2 handoff

Run 2 should add authenticated issuance without weakening the run 1 protocol:

1. Add an issuance HTTP surface that authenticates a real Cloud Session and performs one atomic account/device/session authority check, including revoked devices and the documented legacy unbound-session policy.
2. Add environment-provided Ed25519 key provisioning and explicit active/retiring `kid` selection.
3. Add public verifier discovery (for example JWKS) with an explicit overlap and retirement migration path.
4. Add Fastify + SQLite T2/T3 issuance integration tests and negative authorization tests.
5. Publish canonical fixtures for Cloud Shiyan and hosted Relay and verify both consumers against the same schemas.
6. Select and review production TTLs against the remaining-lifetime revocation limitation.

No run 2 work should make a service verify the raw Cloud Session or require per-request Cloud Auth introspection for ordinary Shiyan/Relay requests.
