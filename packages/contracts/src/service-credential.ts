import { z } from "zod";

/**
 * Canonical, deployment-neutral issuer identity for Cloud Auth service
 * credentials. Services must configure this value explicitly when verifying;
 * they must not derive trust from the token's own `iss` claim.
 */
export const SERVICE_CREDENTIAL_ISSUER = "mira:cloud-auth" as const;

export const CLOUD_SHIYAN_AUDIENCE = "mira:cloud-shiyan" as const;
export const CLOUD_RELAY_TRANSPORT_AUDIENCE = "mira:cloud-relay-transport" as const;

export const serviceCredentialAudienceSchema = z.enum([
  CLOUD_SHIYAN_AUDIENCE,
  CLOUD_RELAY_TRANSPORT_AUDIENCE,
]);

export const SHIYAN_AUTHENTICATE_SCOPE = "shiyan:authenticate" as const;
export const RELAY_TRANSPORT_SCOPE = "relay:transport" as const;

export const serviceCredentialScopeSchema = z.enum([
  SHIYAN_AUTHENTICATE_SCOPE,
  RELAY_TRANSPORT_SCOPE,
]);

export const serviceCredentialKeyIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, "kid must be a bounded key identifier");

export const relayConnectionRoleSchema = z.enum(["client", "host"]);

export const relayRoomSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "room must be a bounded transport identifier");

/**
 * Transport-only context for a hosted Relay connection ticket. `room` binds the
 * ticket to one relay room and `role` identifies the transport peer role. It
 * cannot encode Host Browser/Terminal/Agent/Thread capabilities.
 */
export const relayTicketContextSchema = z
  .object({
    room: relayRoomSchema,
    role: relayConnectionRoleSchema,
  })
  .strict();

export const serviceCredentialJwtHeaderSchema = z
  .object({
    alg: z.literal("EdDSA"),
    typ: z.literal("JWT"),
    kid: serviceCredentialKeyIdSchema,
  })
  .strict();

const temporalClaimsShape = {
  iat: z.number().int().nonnegative(),
  nbf: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
} as const;

const commonClaimsShape = {
  iss: z.string().min(1).max(256),
  sub: z.string().min(1).max(128),
  device_id: z.string().min(1).max(128),
  ...temporalClaimsShape,
} as const;

type TemporalClaims = { iat: number; nbf: number; exp: number };

function refineTemporalClaims(claims: TemporalClaims, context: z.RefinementCtx): void {
  if (claims.nbf < claims.iat) {
    context.addIssue({
      code: "custom",
      message: "nbf must not precede iat",
      path: ["nbf"],
    });
  }
  if (claims.exp <= claims.nbf) {
    context.addIssue({
      code: "custom",
      message: "exp must be after nbf",
      path: ["exp"],
    });
  }
}

export const shiyanServiceCredentialClaimsSchema = z
  .object({
    ...commonClaimsShape,
    aud: z.literal(CLOUD_SHIYAN_AUDIENCE),
    scope: z.tuple([z.literal(SHIYAN_AUTHENTICATE_SCOPE)]),
  })
  .strict()
  .superRefine(refineTemporalClaims);

export const relayServiceCredentialClaimsSchema = z
  .object({
    ...commonClaimsShape,
    aud: z.literal(CLOUD_RELAY_TRANSPORT_AUDIENCE),
    scope: z.tuple([z.literal(RELAY_TRANSPORT_SCOPE)]),
    relay: relayTicketContextSchema,
  })
  .strict()
  .superRefine(refineTemporalClaims);

export const serviceCredentialClaimsSchema = z.discriminatedUnion("aud", [
  shiyanServiceCredentialClaimsSchema,
  relayServiceCredentialClaimsSchema,
]);

/**
 * Issuance request. The client chooses only the narrow target service. Account,
 * device, issuer, key id and business scope are derived by Cloud Auth from the
 * authenticated device-bound Cloud Session.
 */
export const serviceCredentialRequestSchema = z.discriminatedUnion("audience", [
  z
    .object({
      audience: z.literal(CLOUD_SHIYAN_AUDIENCE),
    })
    .strict(),
  z
    .object({
      audience: z.literal(CLOUD_RELAY_TRANSPORT_AUDIENCE),
      relay: relayTicketContextSchema,
    })
    .strict(),
]);

export const issuedServiceCredentialSchema = z
  .object({
    token: z.string().min(1),
    tokenType: z.literal("Bearer"),
    audience: serviceCredentialAudienceSchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const serviceCredentialPublicJwkSchema = z
  .object({
    kty: z.literal("OKP"),
    crv: z.literal("Ed25519"),
    use: z.literal("sig"),
    alg: z.literal("EdDSA"),
    kid: serviceCredentialKeyIdSchema,
    x: z.string().regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export const serviceCredentialJwksSchema = z
  .object({
    keys: z.array(serviceCredentialPublicJwkSchema),
  })
  .strict();

export const serviceCredentialErrorCodeSchema = z.enum([
  "SERVICE_CREDENTIAL_INVALID_REQUEST",
  "SERVICE_CREDENTIAL_REAUTH_REQUIRED",
  "SERVICE_CREDENTIAL_DEVICE_REQUIRED",
  "SERVICE_CREDENTIAL_RELAY_NOT_AUTHORIZED",
  "SERVICE_CREDENTIAL_UNAVAILABLE",
  "SERVICE_CREDENTIAL_INTERNAL_ERROR",
]);

export const serviceCredentialErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: serviceCredentialErrorCodeSchema,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ServiceCredentialRequest = z.infer<typeof serviceCredentialRequestSchema>;
export type IssuedServiceCredential = z.infer<typeof issuedServiceCredentialSchema>;
export type ServiceCredentialPublicJwk = z.infer<typeof serviceCredentialPublicJwkSchema>;
export type ServiceCredentialJwks = z.infer<typeof serviceCredentialJwksSchema>;
export type ServiceCredentialErrorCode = z.infer<typeof serviceCredentialErrorCodeSchema>;
export type ServiceCredentialErrorEnvelope = z.infer<
  typeof serviceCredentialErrorEnvelopeSchema
>;
export type ServiceCredentialAudience = z.infer<typeof serviceCredentialAudienceSchema>;
export type ServiceCredentialScope = z.infer<typeof serviceCredentialScopeSchema>;
export type RelayConnectionRole = z.infer<typeof relayConnectionRoleSchema>;
export type RelayTicketContext = z.infer<typeof relayTicketContextSchema>;
export type ServiceCredentialJwtHeader = z.infer<typeof serviceCredentialJwtHeaderSchema>;
export type ShiyanServiceCredentialClaims = z.infer<typeof shiyanServiceCredentialClaimsSchema>;
export type RelayServiceCredentialClaims = z.infer<typeof relayServiceCredentialClaimsSchema>;
export type ServiceCredentialClaims = z.infer<typeof serviceCredentialClaimsSchema>;
