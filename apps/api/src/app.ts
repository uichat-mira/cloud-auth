import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { AuthService } from "./auth/auth-service.js";
import { registerAuthRoutes } from "./auth/routes.js";
import type { DeviceService } from "./devices/device-service.js";
import { registerDeviceRoutes } from "./devices/routes.js";
import type { OAuthService } from "./oauth/oauth-service.js";
import { registerOAuthRoutes } from "./oauth/routes.js";
import { registerServiceCredentialRoutes } from "./service-credentials/routes.js";
import type { ServiceCredentialService } from "./service-credentials/service.js";

export interface BuildAppOptions {
  db: DatabaseSync;
  authService?: AuthService;
  deviceService?: DeviceService;
  oauthService?: OAuthService;
  serviceCredentialService?: ServiceCredentialService;
  logger?: boolean | object;
  trustProxy?: boolean;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    trustProxy: options.trustProxy ?? false,
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "mira-cloud-auth",
  }));

  app.get("/ready", async (_request, reply) => {
    try {
      const result = options.db.prepare("SELECT 1 AS ok").get() as { ok?: number } | undefined;
      if (result?.ok !== 1) throw new Error("database readiness query failed");
      return { status: "ready" };
    } catch {
      return reply.code(503).send({ status: "not_ready" });
    }
  });

  if (options.authService) registerAuthRoutes(app, options.authService);
  if (options.deviceService) registerDeviceRoutes(app, options.deviceService);
  if (options.oauthService) registerOAuthRoutes(app, options.oauthService);
  if (options.serviceCredentialService) {
    registerServiceCredentialRoutes(app, options.serviceCredentialService);
  }

  return app;
}
