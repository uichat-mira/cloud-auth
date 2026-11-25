# Mira ID service registry V0 (OPS-047)

## Authority

A registration is a service-to-specific-account grant, not a project-wide enablement. The existing trusted Cloud Auth administrator is the registration authority in V0. Registering a service for an explicit Mira Account ID grants its declared scope without a second client login or per-device enablement. Native clients cannot mutate registrations; no public registration, new shared secret, service marketplace or business data storage is introduced.

Use the existing operator CLI (not a public HTTP write API):

```
pnpm run admin service-register <accountId> [expectedRevision] < service-definition.json
pnpm run admin service-revoke <accountId> <serviceId> <expectedRevision>
```

The explicit account ID must already be allowed and not disabled. The definition is validated against the exported serviceDefinitionSchema. For example (fixture address, not a real service):

```json
{
  "serviceId": "notes",
  "projectId": "fixture",
  "displayName": "Notes",
  "protocol": {
    "name": "mcp",
    "version": "2025-11-25",
    "endpoint": "https://notes.example/mcp"
  },
  "audience": "mira:service:notes",
  "scopes": [
    "service:notes:read"
  ]
}
```

Service ID and project ID are stable bounded identifiers; multiple service IDs can belong to the same project. Protocol is independent of audience. The trusted operator must verify endpoint ownership and never embed secrets in the endpoint or label. HTTPS only, no userinfo, query or fragment. Generic audiences are derived exactly from the service ID; generic scopes must be in its namespace. A service ID cannot be reused with another project or audience, including after revocation. Only the known canonical Who You/Guanlan read and Shiyan authenticate identities can be registered with their existing audience; no Relay ticket or Who You write/send confirmation can be minted via this generic registry. Existing canonical routes remain as before for their existing consumers. No business permissions are broadened.

Exact active registration is idempotent. Creation uses absent/zero expectedRevision. A change or explicit regrant requires the current revision; revoke increments revision and leaves a tombstone. A repeated revoke at the current revision is idempotent. Stale updates fail. Changes and credential issuance serialize on the existing SQLite writer transaction. No new DB engine.

## Consumer contract

- GET /v1/services, authenticated Cloud Session. Returns {"services":[{"definition":{...},"revision":1}]}. Only active registrations for the authenticated account, no secrets or JWTs. It is safe to filter by protocol.name / version; unknown protocols must not be rendered or interpreted as MCP. Empty list is not an error. Catalog data is not a tool-schema catalog.
- POST /v1/services/:serviceId/credential, authenticated active **device-bound** Cloud Session, body {"expectedRevision":1}. Returns {"token":"<service bearer>","tokenType":"Bearer","audience":"mira:service:notes","expiresAt":"<ISO UTC>","serviceId":"notes","revision":1}. No caller-supplied account, scope, endpoint, or audience. Obtain a fresh catalog entry if 409 SERVICE_REGISTRATION_CHANGED; 404 SERVICE_REGISTRATION_NOT_FOUND covers missing, foreign or revoked registrations; 401 means session invalid, 403 means a device-bound session is required, 503 means issuance unavailable. Existing Guanlan readiness gate may return 409 SERVICE_CREDENTIAL_PRINCIPAL_NOT_READY. Responses are no-store. Never send the Cloud Session to a service endpoint.
- For generic services, the token uses the existing EdDSA JWT signer and public JWKS. Claim aud = mira:service:<serviceId>, sub = account ID, device_id = authenticated device, scope = the grant's namespaced scopes. The resource verifies configured issuer, exact audience, signature, expiry and required scope; checks subject against its own business data. No tool approval is inferred from registration. Generic audience is deliberately rejected at the old /v1/service-credentials request route.
- Canonical Who You/Guanlan/Shiyan grants use the same existing tokens and same existing admission rules; these are not new audiences. Legacy canonical credential requests are intentionally unchanged to avoid breaking existing independent consumers. Revoking a registry entry stops registry-mediated issuance, not a legacy canonical flow independently authorized under its old contract. Consumer migration and retiring superseded discovery paths belong to MOB-105 / OPS-048.
- Cache the complete descriptor + revision + bearer + expiration as one authorization binding, scoped to account/device/service. Refresh catalog and check revision on renewal and invalidation; discard old binding on changed/revoked entry, logout, account/device switch, or unknown revision. Do not use catalog metadata as authorization for a subsequent different endpoint. A service credential is not a Cloud Session. The issuer does not proxy or fetch the service endpoint.

Offline expiry: a previously signed credential can remain accepted until exp (configured TTL <=600 seconds, plus any verifier-configured bounded clock skew); revocation prevents future registry issuance and removes the catalog entry, not instantaneous revocation of a bearer already held by a resource consumer. Account/session/device revocation continues to stop future issuance in the existing authority transaction. The client should clear its cached binding immediately when it observes revocation or logout.

The former #140 manual MCP enablement/second directory is not the implementation authority for this contract. Host Grant, official Relay, independent Tailscale, service-side scopes and exact tool approvals remain separate. OPS-047 does not register live accounts, deploy production, or migrate Who You/guanlan consumers; A2/A3 consume the contract separately.


## Verification

`pnpm run check` exercises the registry integration with real SQLite, existing device-bound OAuth sessions, signed credentials and a protocol fixture. The test-branch isolated Docker workflow also executes `node scripts/smoke-service-registry.mjs` from `apps/api`, against a separate compiled loopback API with temporary database, accounts, device bindings and generated signing keys; no deployed account or key is used. This is not Mobile / Who You product interoperability acceptance.

## OPS-049 implementation candidate: login-triggered grants (not a frozen management API)

The next registration model separates trusted application identity, service declarations and account grants. The candidate implements the login-side authority transaction using the new server-owned SQLite application and declaration records. The native clients remain fixed; the existing exact Who You callback is retained until managed enrollment, and a disabled managed record cannot fall back to the static client. Dynamic web client IDs are syntax-validated in shared contracts but admitted only by the server against the exact trusted HTTPS callback.

An OAuth code records the fingerprint of the application and its active service declarations at issuance. Code exchange rechecks that snapshot, the exact client/redirect, PKCE, account and device status under the existing writer transaction. The account grants are derived from that snapshot and share the transaction with code consumption and session creation. A failed grant rolls everything back. Existing scope expansion is rejected pending the maintainer's decision; a code created before a grant's revocation cannot silently restore it. Ordinary session restoration, renewal and logout do not write grants. The consumer GET and credential POST contracts are unchanged. Disabled/retired managed services fail closed at the directory and registry-mediated issuance boundary.

**Not ready for merge or deployment:** the current management trust and migration proposal is under review in OPS-049. This slice introduces no public management or account revocation endpoint and creates no production application records. The integration tests seed trusted administrative records in disposable SQLite only; the actual OAuth and signing paths are real. Remaining implementation includes application credential enrollment/rotation, authenticated declaration CRUD, atomic revision propagation and durable revocation tombstones for retirement/disable (no silent regrant on reenable), authenticated account revoke, existing Who You onboarding, and legacy credential transition without breaking BFF operations. Do not use direct SQL as the product onboarding contract. Existing CLI remains the V0 operator path until the complete reviewed contract is delivered.
