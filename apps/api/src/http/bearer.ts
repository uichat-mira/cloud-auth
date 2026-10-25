import type { FastifyRequest } from "fastify";
import { AuthError } from "../auth/auth-service.js";

export function readBearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (!authorization) throw new AuthError("AUTH_REAUTH_REQUIRED", 401, "Re-authentication is required");

  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match?.[1]) throw new AuthError("AUTH_REAUTH_REQUIRED", 401, "Re-authentication is required");
  return match[1];
}
