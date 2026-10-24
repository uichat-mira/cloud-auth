# Mira Cloud Account / Session V0

This document describes the implemented OPS-006 account/session contract and the OPS-015 authenticated password-change flow. It is not a public-registration or service-credential specification.

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
  "password": "..."
}
```

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

`sessions.device_id` is intentionally nullable in OPS-006. OPS-007 owns Mira Device registration/binding and will attach the session to the canonical device record without redefining the session credential.

## Mira Device (OPS-007 first slice)

A Mira Device represents one Mira Desktop or Mira Mobile installation owned by a Mira Cloud Account. It is not a hardware identity: `installation_id` is a client-generated random UUID created for one installation, and a reinstall or new installation reports a new UUID and therefore becomes a distinct Mira Device. No IMEI, MAC address, serial number, hardware fingerprint, Push provider token, or Remote V1 credential is stored.

The additive `devices` migration persists:

- canonical server-generated device `id`;
- owning `account_id`;
- unique `(account_id, installation_id)` installation identity;
- `platform` (`desktop` or `mobile`) plus optional `client_name` and `client_version` for support;
- nullable `public_key` reserved for a later proof-of-possession design;
- `created_at`, `last_seen_at`, `revoked_at`, and `revoke_reason`.

Both device endpoints require an existing accepted Cloud Session. The acting account is derived from that session; the request cannot name another account. Repeated registration of the same installation under the same account is idempotent and refreshes `last_seen_at` and support metadata.

### POST /v1/devices

Requires `Authorization: Bearer <Cloud Session>`.

```json
{
  "installationId": "random-uuid",
  "platform": "desktop",
  "clientName": "Mira Desktop",
  "clientVersion": "1.0.0"
}
```

`clientName` and `clientVersion` are optional. Unknown fields, malformed installation IDs, and unknown platforms are rejected.

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

### Deferred device lifecycle work

This first OPS-007 slice implements persistence, registration, and own-device listing. Binding new Cloud Sessions to a `device_id`, enforcing device revocation during session renewal/issuance, and exposing an independent revoke operation remain deferred to the second OPS-007 implementation slice. The persisted `revoked_at` state already prevents a revoked installation from silently re-registering, but Cloud Session enforcement is not claimed here.

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
