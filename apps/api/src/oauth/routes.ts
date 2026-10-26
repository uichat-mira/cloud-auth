import {
  OAUTH_AUTHORIZATION_CODE_GRANT_TYPE,
  oauthAuthorizationCallbackErrorSchema,
  oauthAuthorizationRequestSchema,
  oauthStateSchema,
  oauthTokenRequestSchema,
  type OAuthAuthorizationRequest,
  type FirstPartyOAuthClient,
  type OAuthAuthorizationCallbackError,
  type OAuthApiErrorCode,
} from "@uichat-mira/cloud-auth-contracts";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthError } from "../auth/auth-service.js";
import { OAuthError } from "./errors.js";
import type { OAuthService } from "./oauth-service.js";

const AUTHORIZATION_QUERY_KEYS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "state",
  "code_challenge",
  "code_challenge_method",
] as const;

type QueryKey = (typeof AUTHORIZATION_QUERY_KEYS)[number];

interface RawAuthorizationQuery {
  values: Partial<Record<QueryKey, string>>;
  hasDuplicate: boolean;
  hasUnknown: boolean;
}

function readRawAuthorizationQuery(rawUrl: string): RawAuthorizationQuery {
  const url = new URL(rawUrl, "https://cloud-auth.invalid");
  const values: Partial<Record<QueryKey, string>> = {};
  const seen = new Set<string>();
  let hasDuplicate = false;
  let hasUnknown = false;

  for (const [key, value] of url.searchParams) {
    if (!AUTHORIZATION_QUERY_KEYS.includes(key as QueryKey)) {
      hasUnknown = true;
      continue;
    }
    if (seen.has(key)) {
      hasDuplicate = true;
      continue;
    }
    seen.add(key);
    values[key as QueryKey] = value;
  }

  return { values, hasDuplicate, hasUnknown };
}

function callbackErrorCode(
  query: RawAuthorizationQuery,
): OAuthAuthorizationCallbackError {
  const responseType = query.values.response_type;
  if (responseType !== undefined && responseType !== "code") {
    return "unsupported_response_type";
  }
  return "invalid_request";
}

function buildCallbackUrl(
  redirectUri: string,
  parameters: Record<string, string>,
): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function noStore(reply: FastifyReply): FastifyReply {
  return reply
    .header("cache-control", "no-store")
    .header("pragma", "no-cache")
    .header("referrer-policy", "no-referrer");
}

function redirect(reply: FastifyReply, location: string): FastifyReply {
  return noStore(reply).code(302).header("location", location).send();
}

function sendApiError(
  reply: FastifyReply,
  statusCode: number,
  code: OAuthApiErrorCode,
  message: string,
): FastifyReply {
  return noStore(reply).code(statusCode).send({
    error: { code, message },
  });
}


const CSRF_COOKIE_NAME = "mira_oauth_csrf";
const CSRF_FIELD_NAME = "csrf_token";
const FORM_FIELDS = new Set<string>([
  ...AUTHORIZATION_QUERY_KEYS,
  "username",
  "password",
  CSRF_FIELD_NAME,
]);
const TOKEN_FORM_FIELDS = new Set<string>([
  "grant_type",
  "client_id",
  "code",
  "redirect_uri",
  "code_verifier",
  "installation_id",
  "platform",
]);

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function csrfCookie(request: FastifyRequest, value: string): string {
  const secure = request.protocol === "https" ? "; Secure" : "";
  return CSRF_COOKIE_NAME + "=" + value +
    "; Path=/v1/oauth/authorize; HttpOnly; SameSite=Lax; Max-Age=300" + secure;
}

function validCsrf(request: FastifyRequest, posted: string | undefined): boolean {
  if (!posted || !/^[A-Za-z0-9_-]{43}$/.test(posted)) return false;
  const values = (request.headers.cookie ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(CSRF_COOKIE_NAME + "="))
    .map((cookie) => cookie.slice(CSRF_COOKIE_NAME.length + 1));
  if (values.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(values[0] ?? "")) return false;
  const received = Buffer.from(posted, "utf8");
  const expected = Buffer.from(values[0]!, "utf8");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const authorizationStyles = `
:root {
  color-scheme: light;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif;
  color: #18181b;
  background: #fafafa;
  font-synthesis: none;
}
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; min-height: 100dvh; }
main { width: min(100%, 26rem); margin: 0 auto; padding: clamp(3.5rem, 12vh, 7rem) 1.25rem 3rem; }
.brand { display: flex; align-items: center; gap: .65rem; margin-bottom: 3.5rem; font-size: .875rem; font-weight: 600; letter-spacing: -.015em; }
.mark { display: inline-grid; place-items: center; width: 2rem; height: 2rem; border-radius: .55rem; background: #18181b; color: #fff; font-size: .875rem; font-weight: 700; }
h1 { margin: 0; font-size: clamp(1.625rem, 5vw, 2rem); font-weight: 650; letter-spacing: -.04em; line-height: 1.3; }
.lead { margin: .75rem 0 1.75rem; color: #52525b; line-height: 1.75; font-size: .875rem; }
.lead strong { color: #18181b; font-weight: 600; }
form { display: grid; gap: 1.1rem; }
.field { display: grid; gap: .5rem; }
label { font-size: .875rem; font-weight: 550; }
input:not([type=hidden]) { display: block; width: 100%; min-width: 0; min-height: 2.75rem; padding: .65rem .8rem; border: 1px solid #d4d4d8; border-radius: .5rem; background: #fff; color: #18181b; font: inherit; font-size: 1rem; }
input:not([type=hidden]):focus-visible, button:focus-visible { outline: 3px solid #a1a1aa; outline-offset: 2px; }
button { width: 100%; min-height: 2.75rem; margin-top: .35rem; padding: .7rem 1rem; border: 1px solid #18181b; border-radius: .5rem; background: #18181b; color: #fafafa; font: inherit; font-weight: 600; cursor: pointer; }
button:hover { background: #3f3f46; }
button:active { background: #27272a; }
.error { margin: 0 0 1rem; padding: .75rem .875rem; border: 1px solid #fecaca; border-radius: .5rem; background: #fef2f2; color: #991b1b; font-size: .875rem; line-height: 1.6; }
.note { margin: 1.75rem 0 0; color: #71717a; font-size: .75rem; line-height: 1.75; }
@media (max-width: 480px) { main { padding-top: 4rem; } .brand { margin-bottom: 3rem; } }
`;

function renderLoginForm(
  reply: FastifyReply,
  request: FastifyRequest,
  client: FirstPartyOAuthClient,
  parameters: OAuthAuthorizationRequest,
  status = 200,
  error?: string,
): FastifyReply {
  const csrf = randomBytes(32).toString("base64url");
  const hidden = AUTHORIZATION_QUERY_KEYS.map((key) =>
    '<input type="hidden" name="' + key + '" value="' +
    escapeHtml(parameters[key]) + '">'
  ).join("\n");
  const clientLabel = client.platform === "desktop" ? "Mira Desktop" : "Mira Mobile";
  const page = [
    "<!doctype html>",
    '<html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    "<title>授权 " + clientLabel + " — Mira Cloud</title>",
    "<style>" + authorizationStyles + "</style>",
    "</head><body><main>",
    '<header class="brand"><span class="mark" aria-hidden="true">M.</span><span>Mira Cloud</span></header>',
    "<h1>登录并授权</h1>",
    '<p class="lead">使用 Mira Cloud 账号，授权 <strong>' + clientLabel + "</strong>。</p>",
    error ? '<p class="error" role="alert">' + escapeHtml(error) + "</p>" : "",
    '<form method="post" action="/v1/oauth/authorize" autocomplete="on">',
    hidden,
    '<input type="hidden" name="' + CSRF_FIELD_NAME + '" value="' + csrf + '">',
    '<div class="field"><label for="oauth-username">账号</label>',
    '<input id="oauth-username" name="username" autocomplete="username" required maxlength="128"></div>',
    '<div class="field"><label for="oauth-password">密码</label>',
    '<input id="oauth-password" type="password" name="password" autocomplete="current-password" required maxlength="1024"></div>',
    '<button type="submit">授权 ' + clientLabel + "</button>",
    "</form>",
    '<p class="note">密码仅提交给 Mira Cloud 进行身份验证，不会发送给客户端应用。</p>',
    "</main></body></html>",
  ].join("\n");

  return noStore(reply)
    .code(status)
    .header("content-type", "text/html; charset=utf-8")
    .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
    .header("x-content-type-options", "nosniff")
    .header("set-cookie", csrfCookie(request, csrf))
    .send(page);
}

function parseForm(
  request: FastifyRequest,
  allowedFields: ReadonlySet<string> = FORM_FIELDS,
): Record<string, string> | null {
  if (typeof request.body !== "string") return null;
  const values: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [key, value] of new URLSearchParams(request.body)) {
    if (!allowedFields.has(key) || seen.has(key)) return null;
    seen.add(key);
    values[key] = value;
  }
  return values;
}

/**
 * OAuth token requests are canonically form-encoded. Native clients may submit
 * the same bounded field set as a flat JSON object; every value must still be
 * a string and every unknown field is rejected.
 */
function parseTokenBody(request: FastifyRequest): Record<string, string> | null {
  if (typeof request.body === "string") return parseForm(request, TOKEN_FORM_FIELDS);
  if (
    !request.body ||
    typeof request.body !== "object" ||
    Array.isArray(request.body)
  ) {
    return null;
  }

  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(request.body as Record<string, unknown>)) {
    if (!TOKEN_FORM_FIELDS.has(key) || typeof value !== "string") return null;
    values[key] = value;
  }
  return values;
}

export function registerOAuthRoutes(app: FastifyInstance, oauthService: OAuthService): void {
  // A standards-based HTML form posts urlencoded data. Fastify parses it as a
  // bounded string; URLSearchParams and duplicate-key checks are authoritative.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "string", bodyLimit: 8192 },
    (_request, body, done) => done(null, body),
  );

  app.get("/v1/oauth/authorize", async (request, reply) => {
    const query = readRawAuthorizationQuery(request.raw.url ?? "/");

    if (query.hasDuplicate) {
      return sendApiError(
        reply,
        400,
        "OAUTH_INVALID_REQUEST",
        "Authorization request must not repeat parameters",
      );
    }

    const client = oauthService.resolveRegisteredClient(
      query.values.client_id,
      query.values.redirect_uri,
    );
    if (!client) {
      return sendApiError(
        reply,
        400,
        "OAUTH_UNAUTHORIZED_CLIENT",
        "OAuth client or redirect URI is not registered",
      );
    }

    const redirectUri = client.redirectUris.find(
      (candidate) => candidate === query.values.redirect_uri,
    );
    if (!redirectUri) {
      return sendApiError(
        reply,
        400,
        "OAUTH_UNAUTHORIZED_CLIENT",
        "OAuth client or redirect URI is not registered",
      );
    }

    const errorState = oauthStateSchema.safeParse(query.values.state);
    const parsed = oauthAuthorizationRequestSchema.safeParse(query.values);
    if (!parsed.success || query.hasUnknown) {
      const error = oauthAuthorizationCallbackErrorSchema.parse(
        callbackErrorCode(query),
      );
      return redirect(
        reply,
        buildCallbackUrl(redirectUri, {
          error,
          ...(errorState.success ? { state: errorState.data } : {}),
        }),
      );
    }

    return renderLoginForm(reply, request, client, parsed.data);
  });
  app.post("/v1/oauth/authorize", async (request, reply) => {
    const form = parseForm(request);
    if (!form) {
      return sendApiError(reply, 400, "OAUTH_INVALID_REQUEST", "Malformed authorization form");
    }
    if (!validCsrf(request, form.csrf_token)) {
      return sendApiError(reply, 403, "OAUTH_INVALID_REQUEST", "Authorization form validation failed");
    }

    const client = oauthService.resolveRegisteredClient(form.client_id, form.redirect_uri);
    if (!client) {
      return sendApiError(reply, 400, "OAUTH_UNAUTHORIZED_CLIENT", "OAuth client or redirect URI is not registered");
    }

    const parsed = oauthAuthorizationRequestSchema.safeParse({
      response_type: form.response_type,
      client_id: form.client_id,
      redirect_uri: form.redirect_uri,
      state: form.state,
      code_challenge: form.code_challenge,
      code_challenge_method: form.code_challenge_method,
    });
    if (!parsed.success) {
      return sendApiError(reply, 400, "OAUTH_INVALID_REQUEST", "Malformed authorization request");
    }
    if (
      !form.username || form.username.length > 128 ||
      !form.password || form.password.length > 1024
    ) {
      return renderLoginForm(reply, request, client, parsed.data, 401, "Invalid account or password");
    }

    try {
      const grant = await oauthService.authorizeWithPassword(
        form.username,
        form.password,
        request.ip,
        parsed.data,
      );
      // A POST becomes a GET at the native redirect, never forwarding credentials.
      return noStore(reply).code(303).header("location", buildCallbackUrl(grant.redirectUri, {
        code: grant.code,
        state: grant.state,
      })).send();
    } catch (error) {
      if (error instanceof AuthError) {
        if (error.retryAfterSeconds) reply.header("retry-after", String(error.retryAfterSeconds));
        return renderLoginForm(reply, request, client, parsed.data, error.statusCode,
          error.code === "AUTH_RATE_LIMITED" || error.code === "AUTH_BUSY"
            ? "Too many sign-in attempts. Please try again later."
            : "Invalid account or password");
      }
      if (error instanceof OAuthError) {
        return sendApiError(reply, error.statusCode, error.code, error.message);
      }
      reply.log.error({ err: error }, "oauth browser authorization failed");
      return sendApiError(reply, 500, "OAUTH_INTERNAL_ERROR", "Authorization request failed");
    }
  });

  app.post("/v1/oauth/token", async (request, reply) => {
    const form = parseTokenBody(request);
    if (!form) {
      return sendApiError(
        reply,
        400,
        "OAUTH_INVALID_REQUEST",
        "Malformed token request",
      );
    }

    if (form.grant_type !== OAUTH_AUTHORIZATION_CODE_GRANT_TYPE) {
      return form.grant_type === undefined
        ? sendApiError(
            reply,
            400,
            "OAUTH_INVALID_REQUEST",
            "Token request is missing grant_type",
          )
        : sendApiError(
            reply,
            400,
            "OAUTH_UNSUPPORTED_GRANT_TYPE",
            "Only the authorization_code grant is supported",
          );
    }

    const parsed = oauthTokenRequestSchema.safeParse(form);
    if (!parsed.success) {
      return sendApiError(reply, 400, "OAUTH_INVALID_REQUEST", "Invalid token request");
    }

    try {
      return noStore(reply).code(200).send(
        oauthService.exchangeAuthorizationCode(parsed.data),
      );
    } catch (error) {
      if (error instanceof OAuthError) {
        return sendApiError(reply, error.statusCode, error.code, error.message);
      }
      reply.log.error({ err: error }, "oauth token exchange failed");
      return sendApiError(reply, 500, "OAUTH_INTERNAL_ERROR", "Token exchange failed");
    }
  });
}
