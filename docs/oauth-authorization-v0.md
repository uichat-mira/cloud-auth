# Mira Cloud Auth OAuth Authorization Code V0 (OPS-016)

This document specifies the first-party OAuth 2.0 Authorization Code + PKCE S256
authorization boundary implemented by OPS-016. It issues one short-lived,
single-use authorization code to a registered native callback. It does **not**
exchange that code for a token; that is OPS-017. It also does not grant Host,
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
authorization code. The user explicitly signs in and selects **Authorize
Mira Desktop** or **Authorize Mira Mobile**. The form posts to the same
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

Current JSON codes are `OAUTH_INVALID_REQUEST`, `OAUTH_UNAUTHORIZED_CLIENT`,
`OAUTH_REAUTH_REQUIRED`, and `OAUTH_INTERNAL_ERROR`. Invalid CSRF returns 403;
invalid sign-in returns a fresh login form without disclosing the password.
Callback error values are bounded by `oauthAuthorizationCallbackErrorSchema`.

## Authorization code storage

Migration `005_oauth_authorization_codes.sql` adds
`oauth_authorization_codes`. Each row is scoped to:

- canonical account id (derived from server-verified allowlisted credentials);
- registered client id and exact redirect URI;
- PKCE `code_challenge` and `code_challenge_method = 'S256'`;
- SHA-256 hash of the high-entropy code secret, domain-separated for
  authorization codes;
- creation and expiry timestamps;
- nullable one-use state (`consumed_at`, `consumed_by_session_id`,
  `consume_reason`) reserved for OPS-017.

The raw code exists only in the redirect response and at the native client. It is
not written to SQLite, logs, or error responses. Account passwords and Cloud Session material are not stored in this table.

The default lifetime is 300 seconds (`MIRA_AUTH_OAUTH_CODE_TTL_SECONDS`), with a
reviewed minimum of 60 and maximum of 600 seconds.

## Exchange expectations for OPS-017

OPS-017 owns the token endpoint and must consume this record exactly once. Its
exchange contract must:

1. Parse the opaque `mca_v1.<id>.<secret>` code, look up `id`, and verify the
   secret against the stored hash in constant time.
2. Require `grant_type=authorization_code`, the same registered `client_id`, the
   exact stored `redirect_uri`, and a `code_verifier` whose
   `base64url(SHA-256(verifier))` equals the stored S256 `code_challenge`.
3. Reject `plain`, missing, malformed, cross-client, redirect-swapped, expired,
   already-consumed, and concurrently-consumed codes without issuing authority.
4. Atomically mark the row consumed while binding the new Mira Device and
   creating a normal revocable Cloud Session in one SQLite transaction, and
   recheck current account admission/disable state at that boundary.
5. Never return the browser Cloud Session or account password to the native
   client. The exchanged session is its own device-bound Cloud Session and keeps
   the existing renew/logout/device-revoke semantics.
6. Never turn this authorization into Host, Tool, Agent, or Relay authority by
   itself. OAuth authorization here does not grant `tools:invoke`.

The code record deliberately does not contain the Mira Device: the native client
has not yet proven its installation at authorization time. OPS-017 binds the
exchange to the concrete device through the existing server-authoritative device
model.

## Out of scope

- Token exchange, refresh lifecycle, and native/browser end-to-end login UX.
- OIDC, public clients beyond the two reviewed first-party entries, social
  providers, Passkeys, or a general OAuth framework.
- G2 Host grants, G3 Desktop Remote Gateway, Relay room entitlements, Portal
  grant management, deployment, and test/prod promotion.
