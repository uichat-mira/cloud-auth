import { z } from "zod";
import {
  applicationDeclaredServiceSchema,
  applicationIdSchema,
  applicationManifestSchema,
  applicationServiceResourceSchema,
} from "./application-instance.js";
import { applicationServiceScopeSchema } from "./service-credential.js";
import { serviceIdSchema } from "./service-registry.js";

/**
 * Canonical identity of one account's service binding inside one deployment
 * instance. A bare serviceId is never sufficient: two APP_IDs may declare the
 * same local serviceId and resource name without sharing a grant or credential.
 */
export const applicationServiceBindingSchema = z
  .object({
    appId: applicationIdSchema,
    serviceId: serviceIdSchema,
    resource: applicationServiceResourceSchema,
  })
  .strict();

/**
 * Catalog entry returned to an authenticated Mira terminal. It carries the
 * current instance declaration plus the account-grant revision. The catalog is
 * not a tool-schema catalog and does not authorize execution.
 */
export const applicationServiceCatalogEntrySchema = applicationDeclaredServiceSchema
  .extend({
    appId: applicationIdSchema,
    projectId: serviceIdSchema,
    /** Verified manifest name, distinct from the service declaration name. */
    appName: applicationManifestSchema.shape.name,
    /** Account-grant revision; changes on declaration refresh or revoke. */
    revision: z.number().int().positive(),
    /** Instance manifest revision that produced this declaration. */
    manifestRevision: z.number().int().positive(),
  })
  .strict();

export const applicationServiceCatalogSchema = z
  .object({
    services: z.array(applicationServiceCatalogEntrySchema),
  })
  .strict();

/**
 * Credential/revoke request. The caller must repeat the exact protected
 * resource and the catalog revision it is acting on. Account, device, issuer,
 * key id and scopes are derived server-side.
 */
export const applicationServiceBindingRequestSchema = z
  .object({
    resource: applicationServiceResourceSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();

export const applicationServiceCredentialSchema = z
  .object({
    token: z.string().min(1),
    tokenType: z.literal("Bearer"),
    appId: applicationIdSchema,
    serviceId: serviceIdSchema,
    resource: applicationServiceResourceSchema,
    revision: z.number().int().positive(),
    scopes: z.array(applicationServiceScopeSchema).max(32),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const applicationServiceErrorCodeSchema = z.enum([
  "APPLICATION_SERVICE_INVALID_REQUEST",
  "APPLICATION_SERVICE_NOT_FOUND",
  "APPLICATION_SERVICE_CHANGED",
  "APPLICATION_SERVICE_DECLARATION_CHANGED",
  "APPLICATION_SERVICE_UNAVAILABLE",
  "APPLICATION_SERVICE_INTERNAL_ERROR",
]);

export const applicationServiceErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: applicationServiceErrorCodeSchema,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type ApplicationServiceBinding = z.infer<typeof applicationServiceBindingSchema>;
export type ApplicationServiceCatalogEntry = z.infer<
  typeof applicationServiceCatalogEntrySchema
>;
export type ApplicationServiceCatalog = z.infer<typeof applicationServiceCatalogSchema>;
export type ApplicationServiceBindingRequest = z.infer<
  typeof applicationServiceBindingRequestSchema
>;
export type ApplicationServiceCredential = z.infer<
  typeof applicationServiceCredentialSchema
>;
export type ApplicationServiceErrorCode = z.infer<
  typeof applicationServiceErrorCodeSchema
>;
export type ApplicationServiceErrorEnvelope = z.infer<
  typeof applicationServiceErrorEnvelopeSchema
>;
