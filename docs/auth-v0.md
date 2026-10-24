# Mira Cloud Account / Session V0

This document describes the implemented OPS-006 account/session contract, the OPS-015 authenticated password-change flow, and the OPS-007 Mira Device lifecycle. It is not a public-registration or service-credential specification. The run 1 OPS-008 service-credential protocol core is documented separately in [service-credentials-v0.md](service-credentials-v0.md).

## User-facing contract

Mira remains local-first. Cloud sign-in is needed only for Mira-operated cloud services.

A successful root login uses:

- account name;
- password;
- an account that is currently allowed and not disabled.

The service returns an opaque Cloud Session. Normal restore and renewal use that session and do not resend the password.

A network failure is not an authentication verdict. Clients must preserve their stored Cloud Session when Cloud Auth is merely unreachable. Only an explicit 401 `AUTH_REAUTH_REQUIRED` means the presented session is no longer accepted.

## HTTP API

### POST /v1/auth/login

Request:

```json
{
  "username": "pilot",
  "password": "...",
  "device": {
    "installationId": "random-uuidv4",
    "platform": "desktop"
  }
}
```

`device` is optional. Existing browser and older-client callers that omit it keep the OPS-006 unbound-session behavior. Desktop/Mobile clients may include their existing installation identity to have the newly issued Cloud Session atomically bound to that account-owned, non-revoked Mira Device. A device context that is unknown for the account, revoked, or platform-mismatched returns `401 AUTH_DEVICE_REJECTED` and no session. A reinstall or new installation must first sign in without device context and register its new installation through `POST /v1/devices`; it is never rebound from hardware identifiers.

Success returns:

```json
{
  "sessionToken": "mcs_v1....",
  "account": {
    "id": "...",
    "username": "pilot"
  },
  "expiresAt": "..."
}
```

Unknown accounts, wrong passwords, denied accounts and disabled accounts all return the same public error:

`AUTH_INVALID_CREDENTIALS`

This is deliberate account-enumeration resistance.

### GET /v1/auth/session

Requires `Authorization: Bearer <Cloud Session>`.

Returns the account identity and current session expiry. It never returns the stored session hash.

### POST /v1/auth/session/renew

Requires the current Cloud Session. Renewal rotates the bearer secret and extends the engineering-policy expiry without resending the password.

The previous token becomes invalid after successful rotation.

### POST /v1/auth/logout

Requires the current Cloud Session and revokes it.

### POST /v1/auth/password

Requires the current Cloud Session.

Request:

```json
{
  "currentPassword": "...",
  "newPassword": "..."
}
```

Success returns `204` with no body. The new password is validated through the same policy and hashed with the same Argon2id path as account provisioning. A successful change increments the account password version and revokes all Cloud Sessions for the account, including the session that performed the change (`revoke_reason = password_changed`).

An incorrect current password returns `401 AUTH_INVALID_CREDENTIALS` without changing credentials or revoking any session. A new password that fails the policy returns `400 AUTH_INVALID_PASSWORD`, also without changing credentials or sessions.

## Cloud Session storage

The token format is opaque to clients. V0 currently uses a versioned session id plus 256-bit random secret.

The database stores only SHA-256 of the high-entropy secret, domain-separated for Cloud Session use. The plaintext token exists only at initial issuance/renewal and in client secure storage.

`sessions.device_id` remains nullable so OPS-006 browser sessions and older clients keep working. OPS-007 attaches Desktop/Mobile sessions to the canonical device record without redefining the session credential. An unbound session is not reported as device-bound. Once a session is bound it is not silently unbound or moved to another device.

## Mira Device (OPS-007)

A Mira Device represents one Mira Desktop or Mira Mobile installation owned by a Mira Cloud Account. It is not a hardware identity: `installation_id` is a client-generated random UUIDv4 created for one installation, and a reinstall or new installation reports a new UUID and therefore becomes a distinct Mira Device. No IMEI, MAC address, serial number, hardware fingerprint, Push provider token, or Remote V1 credential is stored.

The additive `devices` migration persists:

- canonical server-generated device `id`;
- owning `account_id`;
- unique `(account_id, installation_id)` installation identity;
- `platform` (`desktop` or `mobile`) plus optional `client_name` and `client_version` for support;
- nullable `public_key` reserved for a later proof-of-possession design;
- `created_at`, `last_seen_at`, `revoked_at`, and `revoke_reason`.

All device endpoints require an existing accepted Cloud Session. The acting account is derived from that session; the request cannot name another account. Repeated registration of the same installation under the same account is idempotent and refreshes `last_seen_at` and support metadata. The installation's platform is immutable: changing desktop to mobile (or vice versa) returns `409 DEVICE_PLATFORM_MISMATCH` without modifying the device.

Registration also binds the acting session to that device when the session is not already device-bound. This is the normal first-install path:

1. sign in (with or without device context);
2. register the installation identity;
3. continue using the now device-bound Cloud Session.

A session already bound to another device is not rebound by a later registration: the request returns `409 DEVICE_SESSION_MISMATCH` and rolls back any device write. A new installation needs a fresh unbound login/session to register.

### POST /v1/devices

Requires `Authorization: Bearer <Cloud Session>`.

```json
{
  "installationId": "random-uuidv4",
  "platform": "desktop",
  "clientName": "Mira Desktop",
  "clientVersion": "1.0.0"
}
```

`clientName` and `clientVersion` are optional. The installation ID must be a random UUIDv4 (not a hardware-derived UUIDv1). Unknown fields, malformed IDs, and unknown platforms are rejected.

Success returns the caller's device metadata without internal account, installation, or key material. The same request from another account creates that account's own device record and does not reveal or reuse the first account's device.

### GET /v1/devices

Requires `Authorization: Bearer <Cloud Session>`.

```json
{
  "devices": [
    {
      "id": "...",
      "platform": "desktop",
      "clientName": "Mira Desktop",
      "clientVersion": "1.0.0",
      "createdAt": "...",
      "lastSeenAt": "...",
      "revokedAt": null
    }
  ]
}
```

The list is scoped to the authenticated account. It never returns password hashes, Cloud Session secret material, installation IDs, public keys, Remote V1 credentials, Provider secrets, or Push tokens.

### DELETE /v1/devices/:deviceId

Requires `Authorization: Bearer <Cloud Session>`.

Revokes one Mira Device owned by the authenticated account and immediately revokes every Cloud Session bound to that device (`revoke_reason = device_revoked`). The response is the public device metadata with `revokedAt` set. Repeating the same revoke for the caller's own device is idempotent and keeps the original revocation timestamp.

A device owned by another account, an unknown device id, and a malformed device id all return the same `404 DEVICE_NOT_FOUND` response, so the endpoint does not reveal whether another account's device exists. Other devices and their sessions on the same account are not affected.

### Session binding and revocation enforcement

Restore (`GET /v1/auth/session`), renewal (`POST /v1/auth/session/renew`), logout, password change, and device operations all authenticate through the same session check. A session bound to a revoked device is rejected with `401 AUTH_REAUTH_REQUIRED` even if the session row itself has not yet been read as revoked.

Renewal performs the rotation and the device-active check in one SQLite write, so a revocation that commits before or after the renewal cannot leave a renewed session attached to a revoked device. Pending self-service password changes revalidate session, device and account authorization atomically after hashing and before writing the new password. Session issuance with a device context likewise resolves the device and inserts the session in one transaction.

Sessions with `device_id = NULL` remain valid for browser and legacy clients. Existing unbound sessions are not retroactively attributed to a device; a Desktop/Mobile client becomes device-bound by registering its installation or by signing in with device context. That nullable field is not an escape hatch for a session that is already bound to a revoked device: binding happens once, cannot be removed through the public API, and every bound session is checked against its device.

### Known V0 boundary

V0 uses installation identity plus possession of a Cloud Session. It does not provide per-device asymmetric proof-of-possession. A client that deliberately omits its device context is treated as a browser/legacy client. Revoking a device therefore stops that device's bound sessions and prevents it from obtaining a new device-bound session, but it cannot distinguish a modified native client that chooses to present itself as a browser. Push installation identity, Remote V1 pairing credentials, and hardware identifiers remain outside this model.

### Web Account Portal client

The Account Portal uses the shared OPS-006 contracts to validate auth responses and errors at runtime. Route components call login, restore, renewal, and logout operations through the auth state layer; they do not issue raw HTTP requests or read bearer tokens.

Browser persistence is behind a `SessionStorageAdapter`. The current Portal implementation uses `sessionStorage`, but the adapter boundary keeps native secure-storage implementations from inheriting browser-only assumptions. Zustand holds only client auth/UI state such as status, current account identity, expiry, pending operations, and stable failure state.

A `401` invalidates and clears the local Cloud Session. Network, `503`, and malformed-response failures preserve a stored session and surface a retryable state instead of presenting the user as logged out. `429` and malformed responses become stable user-facing failures rather than uncaught exceptions. Logout clears the local Cloud Session only after a `204` or an explicit `401 AUTH_REAUTH_REQUIRED`; transient logout failures preserve the stored session so the operation can be retried.

The `/account` Portal exposes a focused password-change form for the signed-in account. Wrong-current-password and password-policy failures keep the local session usable. A successful change clears the local Cloud Session and presents a forced re-login confirmation, matching the server-side revocation of every Cloud Session.

## Password policy and hashing

V0 is password-only root authentication and has no MFA yet.

- minimum password length: 15 Unicode code points;
- maximum: 256 Unicode code points;
- no composition rule;
- Unicode and whitespace are allowed;
- no silent truncation.

Passwords are stored using Node.js 24's Argon2id implementation.

Default V0 floor:

- memory: 19,456 KiB;
- passes: 2;
- parallelism: 1;
- tag length: 32 bytes.

These are implementation/security parameters, not product-visible constants. Runtime configuration refuses to lower the memory or pass floor below the reviewed V0 baseline.

Run:

`pnpm run benchmark:argon2 5`

before environment promotion. The actual 2 vCPU / 2 GiB Mira server must be benchmarked before production use; CI/development measurements do not replace that environment evidence.

## Login abuse controls

The single-instance V0 service uses two independent controls:

- bounded Argon2 concurrency (default 2 concurrent password hashes);
- fixed-window login throttling (default 5 attempts/account/minute and 20 attempts/IP/minute).

The guard is intentionally in-memory for the single-instance SQLite V0 topology. A future multi-instance topology must replace it with an architecture-appropriate shared limiter rather than pretending process-local limits are global.

Unknown usernames still perform a dummy Argon2id verification so ordinary login timing does not trivially distinguish account existence.

## Maintainer administration

OPS-006 intentionally exposes no public admin HTTP endpoint.

The closed pilot is administered from the service runtime/host through the CLI.

Build first:

`pnpm run build`

Then, for example:

```bash
read -s MIRA_PASSWORD
printf '%s' "$MIRA_PASSWORD" | MIRA_AUTH_DB_PATH=/data/auth.sqlite node dist/admin-cli.js provision pilot
unset MIRA_PASSWORD
```

Commands:

- `provision <username>`
- `reset-password <username>`
- `allow <username>`
- `deny <username>`
- `enable <username>`
- `disable <username>`

`provision` and `reset-password` accept the password only from stdin; there is no plaintext password command-line argument.

Password reset, deny and disable revoke existing Cloud Sessions. Resetting the password also changes `password_changed_at`; login session issuance checks that version atomically so a login using a password that was reset during Argon2 verification cannot race through and mint a new session.

## Logging

The application does not log login request bodies. Authorization and Cookie headers are explicitly redacted in the production logger configuration.

Normal auth errors expose stable error codes rather than credential values.
