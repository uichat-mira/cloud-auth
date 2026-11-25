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
