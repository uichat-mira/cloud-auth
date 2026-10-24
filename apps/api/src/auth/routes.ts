import {
  changePasswordRequestJsonSchema,
  loginRequestJsonSchema,
  type ChangePasswordRequest,
  type LoginRequest,
} from "@uichat-mira/cloud-auth-contracts";
import type { FastifyInstance } from "fastify";
import { readBearerToken } from "../http/bearer.js";
import { sendAuthError } from "../http/errors.js";
import type { AuthService } from "./auth-service.js";

export function registerAuthRoutes(app: FastifyInstance, authService: AuthService): void {
  app.post<{ Body: LoginRequest }>(
    "/v1/auth/login",
    {
      schema: {
        body: loginRequestJsonSchema,
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

  app.post<{ Body: ChangePasswordRequest }>(
    "/v1/auth/password",
    {
      schema: {
        body: changePasswordRequestJsonSchema,
      },
    },
    async (request, reply) => {
      try {
        await authService.changePassword(
          readBearerToken(request),
          request.body.currentPassword,
          request.body.newPassword,
          request.ip,
        );
        return reply.code(204).send();
      } catch (error) {
        return sendAuthError(reply, error);
      }
    },
  );
}
