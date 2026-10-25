import { serviceCredentialRequestSchema } from "@uichat-mira/cloud-auth-contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { AuthError } from "../auth/auth-service.js";
import { readBearerToken } from "../http/bearer.js";
import { ServiceCredentialRequestError } from "./errors.js";
import type { ServiceCredentialService } from "./service.js";

const JWKS_CACHE_CONTROL = "public, max-age=300";

function sendServiceCredentialError(reply: FastifyReply, error: unknown) {
  if (error instanceof ServiceCredentialRequestError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
  if (error instanceof AuthError) {
    return reply.code(401).send({
      error: {
        code: "SERVICE_CREDENTIAL_REAUTH_REQUIRED",
        message: "Re-authentication is required",
      },
    });
  }

  reply.log.error({ err: error }, "service credential request failed");
  return reply.code(500).send({
    error: {
      code: "SERVICE_CREDENTIAL_INTERNAL_ERROR",
      message: "Service credential request failed",
    },
  });
}

export function registerServiceCredentialRoutes(
  app: FastifyInstance,
  serviceCredentialService: ServiceCredentialService,
): void {
  app.post("/v1/service-credentials", async (request, reply) => {
    try {
      const token = readBearerToken(request);
      const parsed = serviceCredentialRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: "SERVICE_CREDENTIAL_INVALID_REQUEST",
            message: "Invalid service credential request",
          },
        });
      }
      return reply.code(200).send(serviceCredentialService.issue(token, parsed.data));
    } catch (error) {
      if (
        error instanceof ServiceCredentialRequestError &&
        error.code === "SERVICE_CREDENTIAL_RELAY_NOT_AUTHORIZED"
      ) {
        request.log.info(
          { event: "relay_service_credential_denied" },
          "relay service credential denied",
        );
      }
      return sendServiceCredentialError(reply, error);
    }
  });

  app.get("/.well-known/jwks.json", async (_request, reply) => {
    try {
      reply.header("cache-control", JWKS_CACHE_CONTROL);
      return reply.code(200).send(serviceCredentialService.getJwks());
    } catch (error) {
      return sendServiceCredentialError(reply, error);
    }
  });
}
