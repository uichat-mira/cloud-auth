import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AuthError, type AuthService } from "./auth-service.js";

type LoginBody = { username: string; password: string };

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
  app.post<{ Body: LoginBody }>(
    "/v1/auth/login",
    {
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          required: ["username", "password"],
          properties: {
            username: { type: "string", minLength: 1, maxLength: 128 },
            password: { type: "string", minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await authService.login(request.body.username, request.body.password, request.ip);
        return reply.code(200).send(result);
      } catch (error) {
        return sendAuthError(reply, error);
      }
    },
  );

  app.get("/v1/auth/session", async (request, reply) => {
    try {
      return reply.code(200).send(authService.getSession(readBearerToken(request)));
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/v1/auth/session/renew", async (request, reply) => {
    try {
      return reply.code(200).send(authService.renewSession(readBearerToken(request)));
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    try {
      authService.logout(readBearerToken(request));
      return reply.code(204).send();
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });
}

function readBearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (!authorization) throw new AuthError("AUTH_REAUTH_REQUIRED", 401, "Re-authentication is required");

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) throw new AuthError("AUTH_REAUTH_REQUIRED", 401, "Re-authentication is required");
  return match[1];
}

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    if (error.retryAfterSeconds) reply.header("retry-after", String(error.retryAfterSeconds));
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  reply.log.error({ err: error }, "auth request failed");
  return reply.code(500).send({
    error: {
      code: "AUTH_INTERNAL_ERROR",
      message: "Authentication request failed",
    },
  });
}
