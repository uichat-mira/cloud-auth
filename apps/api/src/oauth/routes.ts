import {
  oauthAuthorizationCallbackErrorSchema,
  oauthAuthorizationRequestSchema,
  oauthStateSchema,
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
    '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<title>Authorize " + clientLabel + " — Mira Cloud</title>",
    '<style>body{font:16px system-ui,sans-serif;max-width:26rem;margin:10vh auto;padding:1.25rem;color:#24262a}label{display:block;margin:1rem 0}input:not([type=hidden]){display:block;width:100%;box-sizing:border-box;font:inherit;padding:.75rem;margin-top:.4rem;border:1px solid #aaa;border-radius:.4rem}button{width:100%;padding:.8rem;font:inherit;background:#31359d;color:white;border:0;border-radius:.4rem}p{line-height:1.5}.error{color:#b21a1a}</style>',
    "</head><body><main>",
    "<h1>Sign in to Mira Cloud</h1>",
    "<p>Sign in with your Mira Cloud Account to authorize " + clientLabel +
      ". Your password stays with Mira Cloud and is never sent to the app.</p>",
    error ? '<p class="error" role="alert">' + escapeHtml(error) + "</p>" : "",
    '<form method="post" action="/v1/oauth/authorize" autocomplete="on">',
    hidden,
    '<input type="hidden" name="' + CSRF_FIELD_NAME + '" value="' + csrf + '">',
    '<label>Username<input name="username" autocomplete="username" required maxlength="128"></label>',
    '<label>Password<input type="password" name="password" autocomplete="current-password" required maxlength="1024"></label>',
    '<button type="submit">Authorize ' + clientLabel + "</button>",
    "</form></main></body></html>",
  ].join("\n");

  return noStore(reply)
    .code(status)
    .header("content-type", "text/html; charset=utf-8")
    .header("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'")
    .header("x-content-type-options", "nosniff")
    .header("set-cookie", csrfCookie(request, csrf))
    .send(page);
}

function parseForm(request: FastifyRequest): Record<string, string> | null {
  if (typeof request.body !== "string") return null;
  const values: Record<string, string> = {};
  const seen = new Set<string>();
  for (const [key, value] of new URLSearchParams(request.body)) {
    if (!FORM_FIELDS.has(key) || seen.has(key)) return null;
    seen.add(key);
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

}
