import { z } from "zod";

export const accountIdentitySchema = z
  .object({
    id: z.string().min(1),
    username: z.string().min(1),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    username: z.string().min(1).max(128),
    password: z.string().min(1).max(256),
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

export const publicAuthErrorCodeSchema = z.enum([
  "AUTH_INVALID_CREDENTIALS",
  "AUTH_INVALID_PASSWORD",
  "AUTH_REAUTH_REQUIRED",
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
export type PublicAuthErrorCode = z.infer<typeof publicAuthErrorCodeSchema>;
export type AuthErrorEnvelope = z.infer<typeof authErrorEnvelopeSchema>;
