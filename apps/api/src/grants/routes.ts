import {
  setHostGrantPolicyRequestSchema,
  updateHostMobileGrantRequestSchema,
} from "@uichat-mira/cloud-auth-contracts";
import type { FastifyInstance, FastifyReply } from "fastify";
import { AuthError } from "../auth/auth-service.js";
import { readBearerToken } from "../http/bearer.js";
import { HostGrantError, type HostGrantService } from "./host-grant-service.js";

const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isId(value: string): boolean {
  return idPattern.test(value);
}
const expectedRevisionPattern = /^\d{1,15}$/;

function invalidRequest(reply: FastifyReply) {
  return reply.code(400).send({
    error: {
      code: "HOST_GRANT_INVALID_REQUEST",
      message: "Invalid Host grant request",
    },
  });
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({
    error: {
      code: "HOST_GRANT_NOT_FOUND",
      message: "Desktop Host or Mobile device not found",
    },
  });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    return reply.code(401).send({
      error: {
        code: "HOST_GRANT_REAUTH_REQUIRED",
        message: "Re-authentication is required",
      },
    });
  }
  if (error instanceof HostGrantError) {
    return reply.code(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
  }
  reply.log.error({ err: error }, "host grant request failed");
  return reply.code(500).send({
    error: {
      code: "HOST_GRANT_INTERNAL_ERROR",
      message: "Host grant request failed",
    },
  });
}

function readExpectedRevision(value: unknown): number | null {
  if (typeof value !== "string" || !expectedRevisionPattern.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function registerHostGrantRoutes(
  app: FastifyInstance,
  hostGrantService: HostGrantService,
): void {
  app.put<{ Params: { hostId: string } }>(
    "/v1/hosts/:hostId/grant-policy",
    async (request, reply) => {
      if (!isId(request.params.hostId)) return notFound(reply);
      const parsed = setHostGrantPolicyRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) return invalidRequest(reply);
      try {
        return reply
          .code(200)
          .send(
            hostGrantService.setPolicy(
              readBearerToken(request),
              request.params.hostId,
              parsed.data,
            ),
          );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get<{ Params: { hostId: string } }>(
    "/v1/hosts/:hostId/grants",
    async (request, reply) => {
      if (!isId(request.params.hostId)) return notFound(reply);
      try {
        return reply
          .code(200)
          .send(hostGrantService.getSnapshot(readBearerToken(request), request.params.hostId));
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.get<{ Params: { hostId: string } }>(
    "/v1/hosts/:hostId/grant",
    async (request, reply) => {
      if (!isId(request.params.hostId)) return notFound(reply);
      try {
        return reply
          .code(200)
          .send(
            hostGrantService.getMobileGrant(
              readBearerToken(request),
              request.params.hostId,
            ),
          );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.patch<{ Params: { hostId: string; mobileDeviceId: string } }>(
    "/v1/hosts/:hostId/grants/:mobileDeviceId",
    async (request, reply) => {
      if (
        !isId(request.params.hostId) ||
        !isId(request.params.mobileDeviceId)
      ) {
        return notFound(reply);
      }
      const parsed = updateHostMobileGrantRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) return invalidRequest(reply);
      try {
        return reply
          .code(200)
          .send(
            hostGrantService.updateMobileGrant(
              readBearerToken(request),
              request.params.hostId,
              request.params.mobileDeviceId,
              parsed.data,
            ),
          );
      } catch (error) {
        return sendError(reply, error);
      }
    },
  );

  app.delete<{
    Params: { hostId: string; mobileDeviceId: string };
    Querystring: { expectedRevision?: string };
  }>("/v1/hosts/:hostId/grants/:mobileDeviceId", async (request, reply) => {
    if (
      !isId(request.params.hostId) ||
      !isId(request.params.mobileDeviceId)
    ) {
      return notFound(reply);
    }
    const expectedRevision = readExpectedRevision(request.query.expectedRevision);
    if (expectedRevision === null) return invalidRequest(reply);
    try {
      return reply
        .code(200)
        .send(
          hostGrantService.revokeMobileGrant(
            readBearerToken(request),
            request.params.hostId,
            request.params.mobileDeviceId,
            expectedRevision,
          ),
        );
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
