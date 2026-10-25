import {
  oauthAuthorizationCallbackErrorSchema,
  oauthAuthorizationRequestSchema,
  oauthStateSchema,
  type OAuthAuthorizationCallbackError,
  type OAuthApiErrorCode,
} from "@uichat-mira/cloud-auth-contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { AuthError } from "../auth/auth-service.js";
import { readBearerToken } from "../http/bearer.js";
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
  const url = new URL(rawUrl, "http://cloud-auth.invalid");
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

export function registerOAuthRoutes(app: FastifyInstance, oauthService: OAuthService): void {
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

    try {
      const grant = oauthService.authorize(readBearerToken(request), parsed.data);
      return redirect(
        reply,
        buildCallbackUrl(grant.redirectUri, {
          code: grant.code,
          state: grant.state,
        }),
      );
    } catch (error) {
      if (error instanceof AuthError) {
        return sendApiError(
          reply,
          401,
          "OAUTH_REAUTH_REQUIRED",
          "Re-authentication is required",
        );
      }
      if (error instanceof OAuthError) {
        return sendApiError(reply, error.statusCode, error.code, error.message);
      }

      reply.log.error({ err: error }, "oauth authorization failed");
      return sendApiError(
        reply,
        500,
        "OAUTH_INTERNAL_ERROR",
        "Authorization request failed",
      );
    }
  });
}
