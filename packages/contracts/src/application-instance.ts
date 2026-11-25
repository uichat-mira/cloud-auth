import { z } from "zod";
import { serviceIdSchema } from "./service-registry.js";

const safeHttpsUrl = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return value === value.trim() &&
      url.protocol === "https:" &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !/[\s\\*]/.test(value);
  } catch {
    return false;
  }
}, "Expected a valid HTTPS URL");

export const applicationOriginSchema = safeHttpsUrl.refine(
  (value) => {
    try { return new URL(value).origin === value; } catch { return false; }
  },
  "Expected an HTTPS origin without path, query or fragment",
);

export const applicationIdSchema = z.string()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const applicationRegistrationRequestSchema = z.object({
  origin: applicationOriginSchema,
  appId: applicationIdSchema,
  appSecret: z.string().min(16).max(512),
}).strict();

export const knownApplicationRiskHintSchema = z.enum([
  "sensitive-data-read",
  "external-side-effect",
  "irreversible",
  "credential-use",
  "code-execution",
  "financial-action",
]);

// Unknown future hints stay available to clients for diagnostics. They do not
// gain semantics or lower any local safety policy merely by being present.
export const applicationRiskHintSchema = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/);

const toolNameSchema = z.string().min(1).max(200);

export const applicationCapabilitySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9.-]{0,63}$/),
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500).optional(),
  toolRefs: z.array(toolNameSchema).max(256).default([]),
  selectionWeightHint: z.number().min(0).max(1).optional(),
}).strict();

export const applicationToolGovernanceSchema = z.object({
  toolRef: toolNameSchema,
  riskHints: z.array(applicationRiskHintSchema).max(16).optional(),
  confirmationHint: z.literal("recommended").optional(),
}).strict();

export const applicationDeclaredServiceSchema = z.object({
  serviceId: serviceIdSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500).optional(),
  type: serviceIdSchema,
  protocol: z.object({
    name: serviceIdSchema,
    version: z.string().min(1).max(64),
    endpoint: safeHttpsUrl,
  }).strict(),
  resource: safeHttpsUrl,
  scopes: z.array(z.string().min(1).max(140)).max(32).default([]),
  targets: z.array(z.enum(["mobile", "desktop"])).max(2).optional(),
  capabilities: z.array(applicationCapabilitySchema).max(128).optional(),
  toolGovernance: z.array(applicationToolGovernanceSchema).max(256).optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
}).strict();

export const applicationManifestSchema = z.object({
  schemaVersion: z.literal("1"),
  appId: applicationIdSchema,
  projectId: serviceIdSchema,
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500).optional(),
  homeUrl: safeHttpsUrl,
  iconUrl: safeHttpsUrl.optional(),
  manifestRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  oauth: z.object({
    clientId: z.string().min(1).max(2048),
    metadataUrl: safeHttpsUrl.optional(),
    redirectUris: z.array(safeHttpsUrl).min(1).max(16),
  }).strict(),
  registrationVerification: z.object({
    endpoint: safeHttpsUrl,
  }).strict(),
  services: z.array(applicationDeclaredServiceSchema).max(64).refine(
    (services) => new Set(services.map((service) => service.serviceId)).size === services.length,
    "Duplicate serviceId",
  ),
}).strict();

export const applicationRegistrationVerificationResponseSchema = z.object({
  ok: z.literal(true),
  appId: applicationIdSchema,
}).strict();

export const ownedApplicationInstanceSchema = z.object({
  appId: applicationIdSchema,
  origin: applicationOriginSchema,
  manifest: applicationManifestSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const applicationInstanceCatalogSchema = z.object({
  applications: z.array(ownedApplicationInstanceSchema),
}).strict();

export const applicationRegistrationResponseSchema = z.object({
  application: ownedApplicationInstanceSchema,
}).strict();

export const applicationOwnershipRemovalResponseSchema = z.object({
  appId: applicationIdSchema,
  owned: z.literal(false),
}).strict();

export type ApplicationRegistrationRequest = z.infer<typeof applicationRegistrationRequestSchema>;
export type ApplicationManifest = z.infer<typeof applicationManifestSchema>;
export type OwnedApplicationInstance = z.infer<typeof ownedApplicationInstanceSchema>;
