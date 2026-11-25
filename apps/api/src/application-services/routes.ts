import type { FastifyInstance, FastifyReply } from "fastify";
import { AuthError, type AuthService } from "../auth/auth-service.js";
import { readBearerToken } from "../http/bearer.js";
import { ServiceCredentialRequestError } from "../service-credentials/errors.js";
import { ApplicationServiceError } from "./repository.js";
import type { ApplicationServiceService } from "./service.js";

function failure(reply: FastifyReply, error: unknown) {
  if (
    error instanceof AuthError ||
    error instanceof ApplicationServiceError ||
    error instanceof ServiceCredentialRequestError
  ) {
    return reply.code(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
  }
  return reply.code(500).send({
    error: {
      code: "APPLICATION_SERVICE_INTERNAL_ERROR",
      message: "Application service request failed",
    },
  });
}

export function registerApplicationServiceRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ApplicationServiceService,
): void {
  app.get("/v1/application-services", async (request, reply) => {
    try {
      const account = auth.requireAccountIdentity(readBearerToken(request));
      return reply
        .header("cache-control", "no-store")
        .send(service.catalog(account.id));
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.post<{ Params: { appId: string; serviceId: string } }>(
    "/v1/application-services/:appId/:serviceId/revoke",
    async (request, reply) => {
      try {
        const account = auth.requireAccountIdentity(readBearerToken(request));
        return reply
          .header("cache-control", "no-store")
          .send(
            service.revoke(
              account.id,
              request.params.appId,
              request.params.serviceId,
              request.body,
            ),
          );
      } catch (error) {
        return failure(reply, error);
      }
    },
  );

  app.post<{ Params: { appId: string; serviceId: string } }>(
    "/v1/application-services/:appId/:serviceId/credential",
    async (request, reply) => {
      try {
        return reply
          .header("cache-control", "no-store")
          .send(
            service.issue(
              readBearerToken(request),
              request.params.appId,
              request.params.serviceId,
              request.body,
            ),
          );
      } catch (error) {
        return failure(reply, error);
      }
    },
  );
}
