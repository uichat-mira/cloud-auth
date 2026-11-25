import { z } from "zod";
import { applicationIdSchema } from "./application-instance.js";
import {
  oauthAuthorizationCodeSchema, oauthClientIdSchema, oauthRedirectUriSchema,
  oauthPkceCodeVerifierSchema,
} from "./oauth.js";

export const applicationOAuthTokenRequestSchema = z.object({
  grant_type: z.literal("authorization_code"),
  client_id: oauthClientIdSchema,
  redirect_uri: oauthRedirectUriSchema,
  code: oauthAuthorizationCodeSchema,
  code_verifier: oauthPkceCodeVerifierSchema,
}).strict();

export const applicationOAuthIdentitySchema = z.object({
  issuer: z.literal("mira:cloud-auth"),
  subject: z.string().min(1),
  audience: oauthClientIdSchema,
  appId: applicationIdSchema,
  expiresAt: z.iso.datetime(),
}).strict();

export const applicationOAuthTokenResponseSchema = applicationOAuthIdentitySchema.extend({
  access_token: z.string().regex(/^mas_v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive().max(3600),
}).strict();

export type ApplicationOAuthTokenRequest = z.infer<typeof applicationOAuthTokenRequestSchema>;
export type ApplicationOAuthIdentity = z.infer<typeof applicationOAuthIdentitySchema>;
export type ApplicationOAuthTokenResponse = z.infer<typeof applicationOAuthTokenResponseSchema>;
