import { z } from "zod";

export const serviceIdSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
export type RegisteredServiceAudience = `mira:service:${string}`;
export type RegisteredServiceScope = `service:${string}:${string}`;
export const registeredServiceAudienceSchema = z.custom<RegisteredServiceAudience>(
  (value) => typeof value === "string" && /^mira:service:[a-z][a-z0-9-]{0,63}$/.test(value),
);
export const registeredServiceScopeSchema = z.custom<RegisteredServiceScope>(
  (value) => typeof value === "string" && /^service:[a-z][a-z0-9-]{0,63}:[a-z][a-z0-9.-]{0,63}$/.test(value),
);
export function registeredServiceAudience(serviceId: string): RegisteredServiceAudience {
  return `mira:service:${serviceIdSchema.parse(serviceId)}`;
}

const endpointSchema = z.string().max(2048).refine((value) => {
  try {
    const url = new URL(value);
    return value === value.trim() && !/[\s\\]/.test(value) && url.protocol === "https:" && !!url.hostname &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}, "Expected HTTPS endpoint without embedded credentials, query or fragment");

const scopeListSchema = z.array(z.string().min(1).max(140)).min(1).max(32)
  .refine((values) => new Set(values).size === values.length, "Duplicate scopes");
export const serviceDefinitionSchema = z.object({
  serviceId: serviceIdSchema,
  projectId: serviceIdSchema,
  displayName: z.string().trim().min(1).max(100),
  protocol: z.object({
    name: serviceIdSchema,
    version: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/),
    endpoint: endpointSchema,
  }).strict(),
  audience: z.union([
    registeredServiceAudienceSchema,
    z.enum(["mira:cloud-shiyan", "mira:cloud-guanlan", "mira:who-you"]),
  ]),
  scopes: scopeListSchema,
}).strict().superRefine((value, ctx) => {
  const scopes = value.scopes;
  let valid = false;
  if (value.audience === "mira:who-you") {
    valid = value.serviceId === "who-you" && value.projectId === "who-you" && scopes.length === 1 && scopes[0] === "whoyou.read";
  } else if (value.audience === "mira:cloud-guanlan") {
    valid = value.serviceId === "cloud-guanlan" && value.projectId === "cloud-guanlan" && scopes.length === 1 && scopes[0] === "guanlan.read";
  } else if (value.audience === "mira:cloud-shiyan") {
    valid = value.serviceId === "cloud-shiyan" && value.projectId === "cloud-shiyan" && scopes.length === 1 && scopes[0] === "shiyan:authenticate";
  } else {
    valid = !["who-you", "cloud-guanlan", "cloud-shiyan"].includes(value.serviceId) &&
      value.audience === registeredServiceAudience(value.serviceId) &&
      scopes.every(scope => registeredServiceScopeSchema.safeParse(scope).success &&
        scope.startsWith(`service:${value.serviceId}:`));
  }
  if (!valid) ctx.addIssue({ code: "custom", message: "Invalid service audience or grant scopes", path: ["scopes"] });
});
export const registeredServiceSchema = z.object({
  definition: serviceDefinitionSchema,
  revision: z.number().int().positive(),
}).strict();
export const serviceCatalogSchema = z.object({
  services: z.array(registeredServiceSchema),
}).strict();
export const registeredServiceCredentialRequestSchema = z.object({
  expectedRevision: z.number().int().positive(),
}).strict();
export const registeredServiceCredentialSchema = z.object({
  token: z.string().min(1),
  tokenType: z.literal("Bearer"),
  audience: serviceDefinitionSchema.shape.audience,
  expiresAt: z.iso.datetime(),
  serviceId: serviceIdSchema,
  revision: z.number().int().positive(),
}).strict();
export type ServiceDefinition = z.infer<typeof serviceDefinitionSchema>;
export type RegisteredService = z.infer<typeof registeredServiceSchema>;
export type ServiceCatalog = z.infer<typeof serviceCatalogSchema>;
export type RegisteredServiceCredential = z.infer<typeof registeredServiceCredentialSchema>;
