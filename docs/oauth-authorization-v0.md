# Mira Cloud Auth OAuth Authorization Code + Token Exchange V0 (OPS-016/OPS-017)

This document specifies the first-party OAuth 2.0 Authorization Code + PKCE S256
authorization boundary implemented by OPS-016 and the one-time token exchange
implemented by OPS-017. It issues one short-lived, single-use authorization
code to a registered native callback, then redeems it once for the existing
revocable, device-bound Mira Cloud Session authority. It does not grant Host,
Tool, Relay, or other business authorization.

## First-party client registry

Only the following static, reviewed public native clients are accepted:

| Client id | Platform | Exact registered redirect URI |
| --- | --- | --- |
| `mira-desktop` | Desktop | `mira-desktop://oauth/callback` |
| `mira-mobile` | Mobile | `mira-mobile://oauth/callback` |

The shared literals live in
`packages/contracts/src/oauth.ts` and are exported from
`@uichat-mira/cloud-auth-contracts`.

Registration rules:

- Matching is an exact string comparison. Case, trailing slash, query, fragment,
  encoding, and port differences are not normalized.
- No wildcard, dynamic loopback port, `http`, `https`, `javascript:`, `data:`, or
  caller-supplied scheme is accepted.
- Adding or changing a client or redirect URI requires a reviewed change to the
  shared registry; it is not deployment configuration and not supplied by the
  requesting client.
- Desktop/Mobile owners must implement the callback handler for the exact URI
  above. DSK-005/MOB-078 own the native browser and secure-storage journey.

## Browser authorization (GET and POST)

The native app opens the standard authorization URL in the **system browser**.
The server returns an HTML login/authorization form (HTTP 200), not an
authorization code. The user explicitly signs in and selects **授权 Mira Desktop** or
**授权 Mira Mobile** (native-app authorization buttons). The form posts to the same
first-party origin, and the server issues the code only after a successful
Mira Cloud account/password check. No client can attach an arbitrary Bearer
to bypass the browser interaction.

```http
GET /v1/oauth/authorize?response_type=code&client_id=mira-desktop
    &redirect_uri=mira-desktop%3A%2F%2Foauth%2Fcallback
    &state=<opaque-16-512-url-safe-characters>
    &code_challenge=<43-character-base64url-sha256>
    &code_challenge_method=S256
```

Browser transaction:

1. GET validates the exact client/redirect and PKCE parameters, then renders a
   minimal self-contained HTML form; it issues a fresh unpredictable CSRF token
   as a scoped, HttpOnly, SameSite=Lax cookie (Secure over HTTPS).
2. The form posts the same validated parameters, username, password, and
   matching CSRF field as `application/x-www-form-urlencoded` to
   `POST /v1/oauth/authorize`. No JavaScript or actual browser test runner
   is required; a normal HTML form works in external browsers.
3. The server verifies CSRF and request integrity, then authenticates using
   the **existing allowlisted account/password verifier, rate-limit guard,
   and admission checks**. It does *not* mint a Cloud Session for this step.
4. If accepted, the server creates the existing opaque, short-lived,
   hash-stored authorization code and responds with HTTP 303 to the exact
   registered native callback, preserving the caller's original `state`.

No password, Cloud Session or bearer is returned to the native app, logged,
or embedded in a URL. No new browser-session table/cookie is introduced:
authorization is deliberately a fresh, explicit first-party sign-in per
request for this minimal V0 boundary. Portal `sessionStorage` is not used
or silently elevated to OAuth authorization. UX / SSO enhancements belong
to future independently authorized work, not OPS-016.

Missing or incorrect CSRF, duplicate/unknown POST fields, invalid request,
unregistered callback, wrong credentials, blocked/disabled accounts all fail
closed without code. The form's POST body is bounded. Fastify HTTP inject
contract tests cover this browser protocol without launching Chromium.

### Parameter rules

| Parameter | Rule |
| --- | --- |
| `response_type` | Exactly `code`. Anything else returns `unsupported_response_type` on the registered callback. |
| `client_id` | One of the registered first-party ids. |
| `redirect_uri` | Exact registered callback for that client. |
| `state` | Required, opaque, 16-512 URL-safe characters (`A-Z`, `a-z`, `0-9`, `.`, `_`, `~`, `-`). Returned unchanged. |
| `code_challenge` | Exactly 43 unpadded base64url characters, the S256 output shape. Repeated single-character values are rejected. |
| `code_challenge_method` | Exactly `S256`. `plain`, missing, and any other method are rejected. |
| Other parameters | Rejected. Duplicate parameters are rejected. |

### Success

On successful browser-form POST the endpoint returns `303` with a `Location` to the **registered**
callback:

```text
mira-desktop://oauth/callback?code=mca_v1.<id>.<secret>&state=<original-state>
```

- `code` is opaque, random, short-lived, and single-use. It is not a Cloud
  Session, access token, refresh token, or service credential.
- Only the registered callback receives the code. The request's
  `redirect_uri` is never reflected into any other location.
- The response never contains the account password, the browser Cloud Session,
  or a newly minted client session.
- Responses set `Cache-Control: no-store`, `Pragma: no-cache`, and
  `Referrer-Policy: no-referrer`.

### Errors

Two intentionally different error paths are used so an untrusted redirect can
never receive a browser redirect:

1. If `client_id` or `redirect_uri` is missing, duplicated, unregistered, or not
   an exact pair for that client, the endpoint returns `400` JSON and does not
   emit `Location`. Duplicate query parameters also use this path.
2. If the client/callback pair is registered but the remaining query is invalid,
   the endpoint redirects to that exact registered callback with no code:

   ```text
   mira-desktop://oauth/callback?error=invalid_request&state=<state-if-valid>
   ```

   `response_type` values other than `code` use
   `error=unsupported_response_type`. The state is included only when it is
   syntactically valid; injected separators, CR/LF, and fragments are never
   reflected.

JSON error envelope:

```json
{
  "error": {
    "code": "OAUTH_INVALID_REQUEST",
    "message": "Authorization request must not repeat parameters"
  }
}
```

Authorization JSON codes are `OAUTH_INVALID_REQUEST`,
`OAUTH_UNAUTHORIZED_CLIENT`, `OAUTH_REAUTH_REQUIRED`, and `OAUTH_INTERNAL_ERROR`.
The token exchange adds `OAUTH_INVALID_GRANT` and
`OAUTH_UNSUPPORTED_GRANT_TYPE`. Invalid CSRF returns 403; invalid sign-in returns
a fresh login form without disclosing the password. Callback error values are
bounded by `oauthAuthorizationCallbackErrorSchema`.

## Authorization code storage

Migration `005_oauth_authorization_codes.sql` adds
`oauth_authorization_codes`. Each row is scoped to:

- canonical account id (derived from server-verified allowlisted credentials);
- registered client id and exact redirect URI;
- PKCE `code_challenge` and `code_challenge_method = 'S256'`;
- SHA-256 hash of the high-entropy code secret, domain-separated for
  authorization codes;
- creation and expiry timestamps;
- one-use state (`consumed_at`, `consumed_by_session_id`, `consume_reason`)
  written by the OPS-017 exchange transaction.

The raw code exists only in the redirect response and at the native client. It is
not written to SQLite, logs, or error responses. Account passwords and Cloud Session material are not stored in this table.

The default lifetime is 300 seconds (`MIRA_AUTH_OAUTH_CODE_TTL_SECONDS`), with a
reviewed minimum of 60 and maximum of 600 seconds.

## Token exchange (OPS-017)

`POST /v1/oauth/token` consumes the OPS-016 code exactly once and returns the
**existing** Cloud Session authority. It is deliberately not a general OAuth
token or refresh platform.

### Request

`application/x-www-form-urlencoded` is the canonical format. The same fields may
also be sent as a flat JSON object for native-client convenience. In both cases
the request is bounded and strict: every field is required, repeated fields are
rejected, and unknown fields (including `code_challenge_method=plain`, `scope`,
`account_id`, or `device_id`) are rejected.

```http
POST /v1/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&client_id=mira-desktop
&code=mca_v1.<id>.<secret>
&redirect_uri=mira-desktop%3A%2F%2Foauth%2Fcallback
&code_verifier=<43-128-rfc7636-unreserved-characters>
&installation_id=<random-uuidv4>
&platform=desktop
```

| Field | Rule |
| --- | --- |
| `grant_type` | Exactly `authorization_code`. Other values return `OAUTH_UNSUPPORTED_GRANT_TYPE`. |
| `client_id` | Must equal the registered client stored on the code (`mira-desktop` or `mira-mobile`). |
| `code` | Opaque `mca_v1.<id>.<secret>`. The secret is verified against the stored SHA-256 hash. |
| `redirect_uri` | Must exactly equal the URI stored on the code, which was already validated against the client registry. |
| `code_verifier` | RFC 7636 `[A-Za-z0-9-._~]{43,128}`. `base64url(SHA-256(verifier))` must equal the stored S256 challenge. `plain` is never accepted. |
| `installation_id` | Random UUIDv4 identifying the receiving installation. It is an **input identifier only**: ownership, platform and revocation are resolved server-side. |
| `platform` | `desktop` or `mobile`. Must match an existing device's immutable platform. |

### Success

```json
{
  "sessionToken": "mcs_v1....",
  "account": { "id": "...", "username": "..." },
  "expiresAt": "2026-10-25T11:00:00.000Z"
}
```

This is exactly `issuedCloudSessionSchema`: the response is a normal Cloud
Session, not an OAuth access token with extra scopes. `Cache-Control: no-store`,
`Pragma: no-cache` and `Referrer-Policy: no-referrer` are set. The raw code and
verifier are never echoed, and no password or browser Cloud Session is returned.

### Atomic device binding

The exchange runs in one SQLite `BEGIN IMMEDIATE` transaction that re-reads:

1. the code row, secret hash, expiry, consumed state, client and redirect;
2. the stored S256 challenge against the submitted verifier;
3. the account's current `is_allowed` and `disabled_at` state;
4. the account-owned device identified by `(account_id, installation_id)`.

If the device does not exist for the authorized account, the exchange creates it
(the code proves account authentication; the installation identity is the same
random UUID used by normal device registration). If the device exists it must be
non-revoked and the same platform. A caller cannot supply a device id, owner
account, scopes, or another account's identity. The same installation id under a
different account is a separate device, so cross-account binding cannot be
forged.

On success the code row is marked consumed (`consumed_at`,
`consumed_by_session_id`, `consume_reason = 'exchanged'`), the device is created
or refreshed, and a session with `device_id` bound is inserted in the same
transaction. A concurrent, replayed, expired, mismatched-verifier, wrong-client,
redirect-swapped, revoked-device or disabled/denied-account attempt returns one
bounded error and creates no session, device or authority.

### Errors

All invalid code/verifier/client/redirect/expiry/replay/account states return
the same non-enumerating response:

```json
{ "error": { "code": "OAUTH_INVALID_GRANT", "message": "Authorization code cannot be exchanged" } }
```

Malformed or unexpected parameters return `OAUTH_INVALID_REQUEST`; a non-code
grant returns `OAUTH_UNSUPPORTED_GRANT_TYPE`. Errors never contain the code,
verifier, password, session token, redirect contents, or account/device details.

### Native refresh and restore

There is no refresh token. The returned `sessionToken` is the only native
credential and should be stored with the platform OS secret store by the native
client owner (DSK-005/MOB-078):

- restore: `GET /v1/auth/session` with `Authorization: Bearer <sessionToken>`;
- extend/rotate: `POST /v1/auth/session/renew` (old bearer invalid after rotate);
- logout: `POST /v1/auth/logout`;
- device revoke: `DELETE /v1/devices/:deviceId` revokes the device and every
  session bound to it;
- service credentials: use the session with the existing OPS-008
  `POST /v1/service-credentials` endpoint.

If renew/restore returns `401 AUTH_REAUTH_REQUIRED`, the native client starts a
new browser authorization. It must not silently fall back to a browser/portal
Cloud Session. A password reset, account deny/disable, or device revoke
invalidates the native session through the existing checks.

### Mobile/Desktop protocol fixture

The reviewed fixture shared by both native clients is:

1. native app generates a high-entropy `code_verifier` and
   `code_challenge = base64url(SHA-256(verifier))`;
2. open the OPS-016 `/v1/oauth/authorize` URL in the system browser with
   `client_id`, exact `redirect_uri`, `state`, `code_challenge` and
   `code_challenge_method=S256`;
3. receive `code` and the same `state` at the registered callback;
4. POST the token request above with the same verifier, client, redirect and its
   own `installation_id`/`platform`;
5. store only the returned `sessionToken` and use the existing Cloud Session
   endpoints. Never store the browser password or a browser session.

Negative fixtures covered by T2/T3: replayed code, expired code, concurrent
double exchange, wrong verifier, `plain`/unknown request parameters,
`client_credentials` grant, cross-client/redirect swap, revoked device,
disabled/denied account, and a Cloud Session bearer presented instead of a code.

## Out of scope

- Native/browser end-to-end login UX, browser callbacks and OS secure storage
  (DSK-005/MOB-078), and any refresh-token platform.
- OIDC, public clients beyond the two reviewed first-party entries, social
  providers, Passkeys, or a general OAuth framework.
- G2 Host grants, G3 Desktop Remote Gateway, Relay room entitlements, Portal
  grant management, deployment, and test/prod promotion.
