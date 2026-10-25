import { z } from "zod";

export {
  FIRST_PARTY_OAUTH_CLIENTS,
  MIRA_DESKTOP_OAUTH_CLIENT_ID,
  MIRA_DESKTOP_OAUTH_REDIRECT_URI,
  MIRA_MOBILE_OAUTH_CLIENT_ID,
  MIRA_MOBILE_OAUTH_REDIRECT_URI,
  OAUTH_AUTHORIZATION_CODE_DEFAULT_TTL_SECONDS,
  OAUTH_AUTHORIZATION_CODE_MAX_TTL_SECONDS,
  OAUTH_AUTHORIZATION_CODE_RESPONSE_TYPE,
  OAUTH_PKCE_S256_METHOD,
  findFirstPartyOAuthClient,
  isRegisteredOAuthRedirectUri,
  oauthApiErrorCodeSchema,
  oauthApiErrorEnvelopeSchema,
  oauthAuthorizationCallbackErrorSchema,
  oauthAuthorizationCallbackSchema,
  oauthAuthorizationCodeSchema,
  oauthAuthorizationErrorCallbackSchema,
  oauthAuthorizationRequestSchema,
  oauthClientIdSchema,
  oauthCodeChallengeMethodSchema,
  oauthPkceCodeChallengeSchema,
  oauthRedirectUriSchema,
  oauthStateSchema,
} from "./oauth.js";

export type {
  FirstPartyOAuthClient,
  OAuthApiErrorCode,
  OAuthApiErrorEnvelope,
  OAuthAuthorizationCallback,
  OAuthAuthorizationCallbackError,
  OAuthAuthorizationErrorCallback,
  OAuthAuthorizationRequest,
  OAuthClientId,
} from "./oauth.js";

export {
  CLOUD_RELAY_TRANSPORT_AUDIENCE,
  CLOUD_SHIYAN_AUDIENCE,
  RELAY_TRANSPORT_SCOPE,
  SERVICE_CREDENTIAL_ISSUER,
  SHIYAN_AUTHENTICATE_SCOPE,
  issuedServiceCredentialSchema,
  relayConnectionRoleSchema,
  relayServiceCredentialClaimsSchema,
  relayTicketContextSchema,
  serviceCredentialAudienceSchema,
  serviceCredentialClaimsSchema,
  serviceCredentialErrorCodeSchema,
  serviceCredentialErrorEnvelopeSchema,
  serviceCredentialJwksSchema,
  serviceCredentialJwtHeaderSchema,
  serviceCredentialKeyIdSchema,
  serviceCredentialPublicJwkSchema,
  serviceCredentialRequestSchema,
  serviceCredentialScopeSchema,
  shiyanServiceCredentialClaimsSchema,
} from "./service-credential.js";

export type {
  IssuedServiceCredential,
  RelayConnectionRole,
  RelayServiceCredentialClaims,
  RelayTicketContext,
  ServiceCredentialAudience,
  ServiceCredentialClaims,
  ServiceCredentialErrorCode,
  ServiceCredentialErrorEnvelope,
  ServiceCredentialJwks,
  ServiceCredentialJwtHeader,
  ServiceCredentialPublicJwk,
  ServiceCredentialRequest,
  ServiceCredentialScope,
  ShiyanServiceCredentialClaims,
} from "./service-credential.js";

export const accountIdentitySchema = z
  .object({
    id: z.string().min(1),
    username: z.string().min(1),
  })
  .strict();

export const devicePlatformSchema = z.enum(["desktop", "mobile"]);

const installationIdPattern =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const installationIdSchema = z
  .string()
  .regex(installationIdPattern, "installationId must be a randomly generated UUIDv4");

export const deviceLoginContextSchema = z
  .object({
    installationId: installationIdSchema,
    platform: devicePlatformSchema,
  })
  .strict();

export const loginRequestSchema = z
  .object({
    username: z.string().min(1).max(128),
    password: z.string().min(1).max(256),
    device: deviceLoginContextSchema.optional(),
  })
  .strict();

export const changePasswordRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(1).max(256),
  })
  .strict();

export const cloudSessionSchema = z
  .object({
    account: accountIdentitySchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const issuedCloudSessionSchema = cloudSessionSchema
  .extend({
    sessionToken: z.string().min(1),
  })
  .strict();

export const deviceIdSchema = z.uuid();

export const registerDeviceRequestSchema = z
  .object({
    installationId: installationIdSchema,
    platform: devicePlatformSchema,
    clientName: z.string().min(1).max(80).regex(/\S/, "clientName must not be blank").optional(),
    clientVersion: z
      .string()
      .min(1)
      .max(64)
      .regex(/\S/, "clientVersion must not be blank")
      .optional(),
  })
  .strict();

export const miraDeviceSchema = z
  .object({
    id: z.string().min(1),
    platform: devicePlatformSchema,
    clientName: z.string().min(1).max(80).nullable(),
    clientVersion: z.string().min(1).max(64).nullable(),
    createdAt: z.iso.datetime(),
    lastSeenAt: z.iso.datetime(),
    revokedAt: z.iso.datetime().nullable(),
  })
  .strict();

export const deviceListResponseSchema = z
  .object({
    devices: z.array(miraDeviceSchema),
  })
  .strict();

export const deviceErrorCodeSchema = z.enum([
  "DEVICE_INVALID_REQUEST",
  "DEVICE_NOT_FOUND",
  "DEVICE_REVOKED",
  "DEVICE_PLATFORM_MISMATCH",
  "DEVICE_SESSION_MISMATCH",
  "DEVICE_INTERNAL_ERROR",
]);

export const deviceErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: deviceErrorCodeSchema,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const publicAuthErrorCodeSchema = z.enum([
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_INVALID_PASSWORD",
  "AUTH_REAUTH_REQUIRED",
  "AUTH_DEVICE_REJECTED",
  "AUTH_RATE_LIMITED",
  "AUTH_BUSY",
  "AUTH_INTERNAL_ERROR",
]);

export const authErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: publicAuthErrorCodeSchema,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const loginRequestJsonSchema = z.toJSONSchema(loginRequestSchema, {
  target: "draft-7",
});

export const changePasswordRequestJsonSchema = z.toJSONSchema(
  changePasswordRequestSchema,
  {
    target: "draft-7",
  },
);

export type AccountIdentity = z.infer<typeof accountIdentitySchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;
export type CloudSession = z.infer<typeof cloudSessionSchema>;
export type IssuedCloudSession = z.infer<typeof issuedCloudSessionSchema>;
export type DevicePlatform = z.infer<typeof devicePlatformSchema>;
export type DeviceLoginContext = z.infer<typeof deviceLoginContextSchema>;
export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;
export type MiraDevice = z.infer<typeof miraDeviceSchema>;
export type DeviceListResponse = z.infer<typeof deviceListResponseSchema>;
export type DeviceErrorCode = z.infer<typeof deviceErrorCodeSchema>;
export type DeviceErrorEnvelope = z.infer<typeof deviceErrorEnvelopeSchema>;
export type PublicAuthErrorCode = z.infer<typeof publicAuthErrorCodeSchema>;
export type AuthErrorEnvelope = z.infer<typeof authErrorEnvelopeSchema>;
