import { z } from "zod";
import { serviceDefinitionSchema, serviceIdSchema } from "./service-registry.js";

const validHttps = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password &&
      !url.search && !url.hash && !/[\s\\*]/.test(value);
  } catch { return false; }
};
const https = z.string().max(2048).refine(validHttps);
const origin = https.refine(value => new URL(value).origin === value);
export const applicationEnrollmentSchema = z.object({
  projectId: serviceIdSchema,
  displayName: z.string().trim().min(1).max(100),
  redirectUri: https,
  endpointOrigins: z.array(origin).min(1).max(16).refine(values => new Set(values).size === values.length),
}).strict();
export const declarationWriteSchema = z.object({
  definition: serviceDefinitionSchema,
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
}).strict();
export const declarationRevisionSchema = z.object({
  expectedRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).strict();

export const reservedApplicationProjects = ["who-you", "cloud-guanlan", "cloud-shiyan"] as const;
export const developerApplicationPermissionSchema = z.object({
  endpointOrigins: applicationEnrollmentSchema.shape.endpointOrigins,
  reservedProjects: z.array(z.enum(reservedApplicationProjects)).max(reservedApplicationProjects.length)
    .refine(values => new Set(values).size === values.length),
}).strict();
export const developerApplicationCreateSchema = applicationEnrollmentSchema.extend({
  currentPassword: z.string().min(1).max(256),
}).strict();
export const developerApplicationActionSchema = z.object({
  currentPassword: z.string().min(1).max(256),
}).strict();
export const applicationDeclarationSchema = z.object({
  definition: serviceDefinitionSchema,
  revision: z.number().int().positive(),
  retired: z.boolean(),
}).strict();
export const ownedApplicationSchema = applicationEnrollmentSchema.extend({
  clientId: serviceIdSchema,
  disabled: z.boolean(),
  services: z.array(applicationDeclarationSchema),
}).strict();
export const developerApplicationCatalogSchema = z.object({
  applications: z.array(ownedApplicationSchema),
  developer: developerApplicationPermissionSchema.nullable(),
}).strict();
export const developerApplicationSecretSchema = z.object({
  clientId: serviceIdSchema,
  managementToken: z.string().min(1),
}).strict();
export const developerApplicationDisabledSchema = z.object({
  clientId: serviceIdSchema,
  disabled: z.literal(true),
}).strict();
