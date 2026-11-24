import { registeredServiceCredentialRequestSchema, serviceIdSchema } from "@uichat-mira/cloud-auth-contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { AuthError, type AuthService } from "../auth/auth-service.js";
import { readBearerToken } from "../http/bearer.js";
import { ServiceCredentialRequestError } from "../service-credentials/errors.js";
import type { ServiceCredentialService } from "../service-credentials/service.js";
import { ServiceRegistryError, type ServiceRegistryRepository } from "./repository.js";

function failure(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError || error instanceof ServiceRegistryError || error instanceof ServiceCredentialRequestError) {
    return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
  }
  return reply.code(500).send({ error: { code: "SERVICE_REGISTRY_INTERNAL_ERROR", message: "Service registry request failed" } });
}

export function registerServiceRegistryRoutes(
  app: FastifyInstance, auth: AuthService, registry: ServiceRegistryRepository, credentials?: ServiceCredentialService,
) {
  app.get("/v1/services", async (request, reply) => {
    try {
      const account = auth.requireAccountIdentity(readBearerToken(request));
      return reply.header("cache-control", "no-store").send({ services: registry.list(account.id) });
    } catch (error) { return failure(reply, error); }
  });
  app.post<{ Params: { serviceId: string } }>("/v1/services/:serviceId/credential", async (request, reply) => {
    try {
      const token = readBearerToken(request);
      const id = serviceIdSchema.safeParse(request.params.serviceId);
      const parsed = registeredServiceCredentialRequestSchema.safeParse(request.body);
      if (!id.success || !parsed.success) throw new ServiceRegistryError("SERVICE_REGISTRATION_INVALID_REQUEST", 400);
      if (!credentials) throw new ServiceRegistryError("SERVICE_CREDENTIAL_UNAVAILABLE", 503);
      return reply.header("cache-control", "no-store").send(credentials.issueRegistered(token, registry, id.data, parsed.data.expectedRevision));
    } catch (error) { return failure(reply, error); }
  });
}
