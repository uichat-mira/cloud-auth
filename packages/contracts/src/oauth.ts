import { z } from "zod";

export const MIRA_DESKTOP_OAUTH_CLIENT_ID = "mira-desktop";
export const MIRA_MOBILE_OAUTH_CLIENT_ID = "mira-mobile";

/**
 * First-party callbacks are exact, reviewed registrations. Native clients must
 * register the same literal URI here before shipping a callback handler; no
 * wildcard, dynamic-port, or caller-supplied callback is accepted.
 */
export const MIRA_DESKTOP_OAUTH_REDIRECT_URI = "mira-desktop://oauth/callback";
export const MIRA_MOBILE_OAUTH_REDIRECT_URI = "mira-mobile://oauth/callback";

export const OAUTH_AUTHORIZATION_CODE_RESPONSE_TYPE = "code";
export const OAUTH_PKCE_S256_METHOD = "S256";
export const OAUTH_AUTHORIZATION_CODE_DEFAULT_TTL_SECONDS = 300;
export const OAUTH_AUTHORIZATION_CODE_MAX_TTL_SECONDS = 600;

export const oauthClientIdSchema = z.enum([
  MIRA_DESKTOP_OAUTH_CLIENT_ID,
  MIRA_MOBILE_OAUTH_CLIENT_ID,
]);

export const oauthRedirectUriSchema = z.string().min(1).max(2048);

const oauthStatePattern = /^[A-Za-z0-9._~-]{16,512}$/;
const oauthPkceChallengePattern = /^[A-Za-z0-9_-]{43}$/;

/**
 * OAuth state is an opaque, bounded correlation value. Restricting it to a
 * URL-safe alphabet keeps it from becoming a reflected-header or callback
 * injection vector.
 */
export const oauthStateSchema = z
  .string()
  .regex(oauthStatePattern, "state must be 16-512 URL-safe characters");

/**
 * S256 produces exactly 43 unpadded base64url characters. Rejecting repeats
 * here catches obviously degenerate challenges without guessing at the
 * entropy of client-generated verifier material.
 */
export const oauthPkceCodeChallengeSchema = z
  .string()
  .regex(oauthPkceChallengePattern, "code_challenge must be an S256 base64url value")
  .refine(
    (value) => !/^([A-Za-z0-9_-])\1{42}$/.test(value),
    "code_challenge must not be a repeated single character",
  );

export const oauthCodeChallengeMethodSchema = z.literal(OAUTH_PKCE_S256_METHOD);

export const oauthAuthorizationCodeSchema = z
  .string()
  .regex(/^mca_v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);

export const oauthAuthorizationCallbackErrorSchema = z.enum([
  "invalid_request",
  "unauthorized_client",
  "unsupported_response_type",
  "access_denied",
  "server_error",
]);

export interface FirstPartyOAuthClient {
  readonly clientId: z.infer<typeof oauthClientIdSchema>;
  readonly platform: "desktop" | "mobile";
  readonly redirectUris: readonly string[];
}

function firstPartyClient(client: FirstPartyOAuthClient): FirstPartyOAuthClient {
  return Object.freeze({
    ...client,
    redirectUris: Object.freeze([...client.redirectUris]),
  });
}

export const FIRST_PARTY_OAUTH_CLIENTS: readonly FirstPartyOAuthClient[] = Object.freeze([
  firstPartyClient({
    clientId: MIRA_DESKTOP_OAUTH_CLIENT_ID,
    platform: "desktop",
    redirectUris: [MIRA_DESKTOP_OAUTH_REDIRECT_URI],
  }),
  firstPartyClient({
    clientId: MIRA_MOBILE_OAUTH_CLIENT_ID,
    platform: "mobile",
    redirectUris: [MIRA_MOBILE_OAUTH_REDIRECT_URI],
  }),
]);

export function findFirstPartyOAuthClient(
  clientId: string,
): FirstPartyOAuthClient | undefined {
  return FIRST_PARTY_OAUTH_CLIENTS.find((client) => client.clientId === clientId);
}

export function isRegisteredOAuthRedirectUri(
  clientId: string,
  redirectUri: string,
): boolean {
  return findFirstPartyOAuthClient(clientId)?.redirectUris.includes(redirectUri) ?? false;
}

export const oauthAuthorizationRequestSchema = z
  .object({
    response_type: z.literal(OAUTH_AUTHORIZATION_CODE_RESPONSE_TYPE),
    client_id: oauthClientIdSchema,
    redirect_uri: oauthRedirectUriSchema,
    state: oauthStateSchema,
    code_challenge: oauthPkceCodeChallengeSchema,
    code_challenge_method: oauthCodeChallengeMethodSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (!isRegisteredOAuthRedirectUri(value.client_id, value.redirect_uri)) {
      context.addIssue({
        code: "custom",
        path: ["redirect_uri"],
        message: "redirect_uri is not registered for this client",
      });
    }
  });

export const oauthAuthorizationCallbackSchema = z
  .object({
    code: oauthAuthorizationCodeSchema,
    state: oauthStateSchema,
  })
  .strict();

export const oauthAuthorizationErrorCallbackSchema = z
  .object({
    error: oauthAuthorizationCallbackErrorSchema,
    state: oauthStateSchema.optional(),
  })
  .strict();

export const oauthApiErrorCodeSchema = z.enum([
  "OAUTH_INVALID_REQUEST",
  "OAUTH_UNAUTHORIZED_CLIENT",
  "OAUTH_REAUTH_REQUIRED",
  "OAUTH_INTERNAL_ERROR",
]);

export const oauthApiErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: oauthApiErrorCodeSchema,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type OAuthClientId = z.infer<typeof oauthClientIdSchema>;
export type OAuthAuthorizationRequest = z.infer<typeof oauthAuthorizationRequestSchema>;
export type OAuthAuthorizationCallback = z.infer<typeof oauthAuthorizationCallbackSchema>;
export type OAuthAuthorizationErrorCallback = z.infer<
  typeof oauthAuthorizationErrorCallbackSchema
>;
export type OAuthAuthorizationCallbackError = z.infer<
  typeof oauthAuthorizationCallbackErrorSchema
>;
export type OAuthApiErrorCode = z.infer<typeof oauthApiErrorCodeSchema>;
export type OAuthApiErrorEnvelope = z.infer<typeof oauthApiErrorEnvelopeSchema>;
