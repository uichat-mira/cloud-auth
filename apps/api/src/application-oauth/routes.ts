import type { FastifyInstance, FastifyReply } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { applicationIdSchema } from "@uichat-mira/cloud-auth-contracts";
import { AuthError, type AuthService } from "../auth/auth-service.js";
import { readBearerToken } from "../http/bearer.js";
import { OAuthError } from "../oauth/errors.js";
import { ApplicationOAuthRepository } from "./repository.js";

function fail(reply: FastifyReply, error: unknown) {
  if (error instanceof OAuthError || error instanceof AuthError)
    return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
  return reply.code(500).send({ error: { code: "OAUTH_INTERNAL_ERROR", message: "Application session operation failed" } });
}

export function registerApplicationOAuthRoutes(app: FastifyInstance, db: DatabaseSync, auth: AuthService) {
  const repository = new ApplicationOAuthRepository(db);
  app.get("/v1/oauth/application-session", async (request, reply) => {
    try {
      return reply.header("cache-control", "no-store").send(repository.identity(readBearerToken(request), new Date()));
    } catch (error) { return fail(reply, error); }
  });
  app.post("/v1/oauth/application-session/logout", async (request, reply) => {
    try {
      repository.logout(readBearerToken(request), new Date());
      return reply.header("cache-control", "no-store").code(204).send();
    } catch (error) { return fail(reply, error); }
  });
  app.post<{ Params: { appId: string } }>("/v1/account/application-authorizations/:appId/revoke", async (request, reply) => {
    try {
      const account = auth.requireAccountIdentity(readBearerToken(request));
      const appId = applicationIdSchema.safeParse(request.params.appId);
      if (!appId.success) throw new OAuthError("OAUTH_INVALID_REQUEST", 400, "Invalid application identity");
      repository.revoke(account.id, appId.data, new Date());
      return reply.header("cache-control", "no-store").code(204).send();
    } catch (error) { return fail(reply, error); }
  });
  app.post<{ Params: { appId: string } }>("/v1/account/applications/:appId/status", async (request, reply) => {
    try {
      const account = auth.requireAccountIdentity(readBearerToken(request));
      const appId = applicationIdSchema.safeParse(request.params.appId);
      const body = request.body as { disabled?: unknown } | null;
      if (!appId.success || !body || typeof body.disabled !== "boolean" || Object.keys(body).length !== 1)
        throw new OAuthError("OAUTH_INVALID_REQUEST", 400, "Invalid application status");
      repository.setDisabled(account.id, appId.data, body.disabled, new Date());
      return reply.header("cache-control", "no-store").code(204).send();
    } catch (error) { return fail(reply, error); }
  });
}
