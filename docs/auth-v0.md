# Mira Cloud Account / Session V0

This document describes the implemented OPS-006 contract. It is not a public-registration or service-credential specification.

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

## Cloud Session storage

The token format is opaque to clients. V0 currently uses a versioned session id plus 256-bit random secret.

The database stores only SHA-256 of the high-entropy secret, domain-separated for Cloud Session use. The plaintext token exists only at initial issuance/renewal and in client secure storage.

`sessions.device_id` is intentionally nullable in OPS-006. OPS-007 owns Mira Device registration/binding and will attach the session to the canonical device record without redefining the session credential.

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

`npm run benchmark:argon2 -- 5`

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

`npm run build`

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
