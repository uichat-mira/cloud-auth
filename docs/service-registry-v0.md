# Mira ID service registry V0 (OPS-047)

## Authority: legacy V0 operator path (unmanaged services only)

For managed cloud applications, the OPS-049 contract below takes precedence. The legacy operator path remains only for existing unmanaged services.

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
- Canonical Who You/Guanlan/Shiyan grants use the same existing tokens and business admission rules; these are not new audiences. Once Who You has a managed declaration, its legacy credential route also requires an active account grant (see the OPS-049 activation boundary below). Unmanaged canonical flows remain unchanged. Consumer migration and retiring superseded discovery paths belong to MOB-105 / OPS-048.
- Cache the complete descriptor + revision + bearer + expiration as one authorization binding, scoped to account/device/service. Refresh catalog and check revision on renewal and invalidation; discard old binding on changed/revoked entry, logout, account/device switch, or unknown revision. Do not use catalog metadata as authorization for a subsequent different endpoint. A service credential is not a Cloud Session. The issuer does not proxy or fetch the service endpoint.

Offline expiry: a previously signed credential can remain accepted until exp (configured TTL <=600 seconds, plus any verifier-configured bounded clock skew); revocation prevents future registry issuance and removes the catalog entry, not instantaneous revocation of a bearer already held by a resource consumer. Account/session/device revocation continues to stop future issuance in the existing authority transaction. The client should clear its cached binding immediately when it observes revocation or logout.

The former #140 manual MCP enablement/second directory is not the implementation authority for this contract. Host Grant, official Relay, independent Tailscale, service-side scopes and exact tool approvals remain separate. OPS-047 does not register live accounts, deploy production, or migrate Who You/guanlan consumers; A2/A3 consume the contract separately.


## Verification

`pnpm run check` exercises the registry integration with real SQLite, existing device-bound OAuth sessions, signed credentials and a protocol fixture. The test-branch isolated Docker workflow also executes `node scripts/smoke-service-registry.mjs` from `apps/api`, against a separate compiled loopback API with temporary database, accounts, device bindings and generated signing keys; no deployed account or key is used. This is not Mobile / Who You product interoperability acceptance.

## OPS-049: trusted application enrollment and login-triggered grants

### Authority and one-time enrollment

An application is a reviewed Mira-operated first-party web client, not a third-party OAuth platform. Its identity is the administrator-enrolled client ID, project ID, exact HTTPS OAuth callback and allowed HTTPS service endpoint origins. One application may publish multiple services. Desktop and Mobile native clients remain fixed and cannot enroll as publishers. Existing Who You must use its reserved client ID, project ID and exact reviewed callback. Application registration is not account authorization.

The current operator CLI is the **one-time application onboarding** authority (not per-user onboarding). Enrollment metadata contains no secrets:

```json
{
  "projectId": "who-you",
  "displayName": "狐邮 Who You",
  "redirectUri": "https://who-you.tomz.io/auth/callback",
  "endpointOrigins": ["https://who-you.tomz.io"]
}
```

The callback must match the existing Who You OAuth contract exactly; the administrator must independently verify ownership of all endpoint origins. Run against the intended environment only:

```sh
umask 077
pnpm run admin application-enroll who-you-web < application.json > application-secret.json
pnpm run admin application-rotate who-you-web > rotated-secret.json
pnpm run admin application-disable who-you-web
pnpm run admin application-enable who-you-web > enabled-secret.json
```

Enroll/rotate/enable each return `{"clientId":"who-you-web","managementToken":"<opaque bearer>"}` once. Store the token only in the application's server-side secret store and remove temporary private output files. Do not put it in Git, workflow logs, browser storage, user sessions, OAuth parameters or MCP configuration. Only its SHA-256 digest is persisted; a replacement invalidates the preceding key. Disable invalidates the key, blocks new OAuth exchanges, revokes the application's active account grants with revision increments, and invalidates outstanding authorization codes. Enable creates a new key and login generation; it does not restore revoked grants. An existing identity cannot be reassigned or enrolled again. Changing app identity, callback or allowed origins requires a separately reviewed operator change.

### Application declaration management HTTP contract

All three routes take `Authorization: Bearer <managementToken>` over HTTPS and return `Cache-Control: no-store` on success. A Cloud Session or service credential is not a management token. The application key determines owner; clients cannot supply an account or arbitrary application identity.

| Method and route | Request | Result |
| --- | --- | --- |
| GET /v1/application/services | no body | `{"services":[{"definition":{...},"revision":1,"retired":false}]}` (only own declarations, including retired) |
| PUT /v1/application/services/:serviceId | `{"definition":{...},"expectedRevision":0}` | `{"definition":{...},"revision":1,"retired":false}` |
| POST /v1/application/services/:serviceId/retire | `{"expectedRevision":1}` | `{"definition":{...},"revision":2,"retired":true}` |

The PUT definition is the existing exported serviceDefinitionSchema, identical to the checked-in Who You manifest. The new schemas are exported from the contracts package. Creation requires revision 0; changes and reactivation require the current declaration revision. Repeating an identical active PUT at the current revision is idempotent. A timed-out initial request can reconcile through GET. Wrong owner, project or non-approved endpoint origin is forbidden. No extra fields, account identifiers or scope overrides. Service ID/project/audience cannot move, even after retirement. Existing unmanaged grants with the same service ID must have matching identity and scopes before adoption. Scope changes are rejected until the maintainer defines consent semantics.

A normal descriptor change atomically propagates to existing active account grants and advances their account-grant revisions; declaration revision and account-grant revision are distinct. A new service does not automatically backfill accounts. Retirement tombstones active grants and increments revisions; reactivation restores the declaration only. The next explicit successful login may establish grants again. Managed declarations cannot be registered per account through the old operator CLI. Do not treat a registry entry as a business mailbox permission.

Errors: 401 for invalid/disabled management authority; 400 for invalid declaration; 403 for forbidden owner/project/origin; 404 for missing/foreign retirement target; 409 for revision, identity or scope conflict. Error bodies use `{"error":{"code":"...","message":"..."}}`. Do not retry a conflict without reading the current declaration and evaluating the intended change.

### User login and revocation

Use the existing OAuth authorization code + PKCE flow with the enrolled client ID and exact callback. The code records a fingerprint of the application generation and active declaration revisions/content; exchange revalidates it in the same SQLite writer transaction as account/device verification, code consumption, Cloud Session creation and account grants. No user-side registration request or second enablement. If the snapshot changed or any grant fails, the entire transaction rolls back. Only the logged-in application's services are granted. Repeated active logins are idempotent; ordinary logout, restoration and renewal never grant services.

In addition to the existing catalog and credential routes, a user may explicitly revoke their own grant:

```http
POST /v1/services/who-you/revoke
Authorization: Bearer <Cloud Session>
Content-Type: application/json

{"expectedRevision":1}
```

Returns `{"revision":2}`; only the authenticated account is affected. Revocation leaves a tombstone, removes the catalog entry and stops new issuance. An older authorization code cannot restore the grant; a new active login can. The previously signed offline token retains its existing expiry boundary.

### Who You activation and consumer migration

Deploying the code/migrations alone creates no applications or grants. Existing Who You login is unchanged until one-time enrollment. Publishing the canonical managed Who You declaration activates the grant requirement on BOTH the registry credential route and legacy `/v1/service-credentials` requests for `mira:who-you`, including read, explicit write and confirmation requests. This closes the old Mobile bypass without changing the existing scope/confirmation signing semantics. The Web BFF (`who-you/src/web/cloud-auth.ts`) still needs its existing explicit read/write/identity/send credential requests; do not simply remove the legacy endpoint. A previously logged-in account without a grant must actively log into Who You once after activation; there is no background grant backfill. Existing valid explicit grants are preserved only for matching identity and scopes. A revoked account cannot obtain a new BFF credential until a fresh successful login. Other canonical services retain their current independent issuance semantics.

**Activation is a separate coordinated step:** OPS-048 must verify real BFF login and the declaration registration API, and MOB-105 must verify registry-only consumer cutover, cache invalidation and privacy/tool boundaries before production enrollment. Do not silently enable the managed declaration in production or use direct SQL as the onboarding contract. Existing offline bearers remain usable until expiry; a deployment does not erase them. Downstream cross-service T4 and actual secret provisioning are not part of the isolated Cloud Auth tests.

### Verification

The integration suite exercises two independently enrolled applications, real authenticated declaration HTTP routes, actual login forms/CSRF/PKCE, SQLite and EdDSA issuance; checks wrong application/secret/origin, scope changes, revisions, rotation, retirement, disable/enable, account isolation and old code replay, rollback, explicit revoke and legacy Who You issuance. The admin CLI is independently exercised against disposable SQLite. The source is the candidate contract for downstream review; no production application is registered by this implementation.
