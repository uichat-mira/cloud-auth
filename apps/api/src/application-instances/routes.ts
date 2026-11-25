import { applicationIdSchema } from "@uichat-mira/cloud-auth-contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { AuthError, type AuthService } from "../auth/auth-service.js";
import { readBearerToken } from "../http/bearer.js";
import { ApplicationInstanceError, type ApplicationInstanceService } from "./service.js";

function failure(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError || error instanceof ApplicationInstanceError) {
    return reply.code(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
  }
  return reply.code(500).send({
    error: { code: "APPLICATION_INTERNAL_ERROR", message: "Application request failed" },
  });
}

function parseAppId(value: string) {
  const parsed = applicationIdSchema.safeParse(value);
  if (!parsed.success) throw new ApplicationInstanceError("APPLICATION_INVALID_REQUEST", 400);
  return parsed.data;
}

export function registerApplicationInstanceRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ApplicationInstanceService,
) {
  app.get("/v1/account/applications", async (request, reply) => {
    try {
      const account = auth.requireAccountIdentity(readBearerToken(request));
      return reply.header("cache-control", "no-store").send({
        applications: service.list(account.id),
      });
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.get<{ Params: { appId: string } }>("/v1/account/applications/:appId", async (request, reply) => {
    try {
      const account = auth.requireAccountIdentity(readBearerToken(request));
      return reply.header("cache-control", "no-store").send(
        service.get(account.id, parseAppId(request.params.appId)),
      );
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.post("/v1/account/applications", async (request, reply) => {
    try {
      const account = auth.requireAccountIdentity(readBearerToken(request));
      const application = await service.register(account.id, request.body);
      return reply.header("cache-control", "no-store").send({ application });
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.delete<{ Params: { appId: string } }>("/v1/account/applications/:appId", async (request, reply) => {
    try {
      const account = auth.requireAccountIdentity(readBearerToken(request));
      return reply.header("cache-control", "no-store").send(
        service.removeOwnership(account.id, parseAppId(request.params.appId)),
      );
    } catch (error) {
      return failure(reply, error);
    }
  });
}
