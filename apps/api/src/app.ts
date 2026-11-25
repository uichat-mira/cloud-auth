import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { AuthService } from "./auth/auth-service.js";
import { registerAuthRoutes } from "./auth/routes.js";
import type { DeviceService } from "./devices/device-service.js";
import { registerDeviceRoutes } from "./devices/routes.js";
import type { HostGrantService } from "./grants/host-grant-service.js";
import { registerHostGrantRoutes } from "./grants/routes.js";
import type { HostService } from "./hosts/host-service.js";
import { registerHostRoutes } from "./hosts/routes.js";
import type { OAuthService } from "./oauth/oauth-service.js";
import { registerOAuthRoutes } from "./oauth/routes.js";
import { registerServiceCredentialRoutes } from "./service-credentials/routes.js";
import type { ServiceCredentialService } from "./service-credentials/service.js";
import { ServiceRegistryRepository } from "./service-registry/repository.js";
import { registerServiceRegistryRoutes } from "./service-registry/routes.js";
import { ApplicationInstanceService } from "./application-instances/service.js";
import { registerApplicationInstanceRoutes } from "./application-instances/routes.js";
import {
  HttpsApplicationRegistrationTransport,
  type ApplicationRegistrationTransport,
} from "./application-instances/transport.js";

import { TrustedApplicationManagement } from "./trusted-applications/management.js";
import { registerTrustedApplicationRoutes } from "./trusted-applications/routes.js";

export interface BuildAppOptions {
  db: DatabaseSync;
  authService?: AuthService;
  deviceService?: DeviceService;
  hostService?: HostService;
  hostGrantService?: HostGrantService;
  oauthService?: OAuthService;
  serviceCredentialService?: ServiceCredentialService;
  applicationRegistrationTransport?: ApplicationRegistrationTransport;
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

  if (options.authService) {
    registerAuthRoutes(app, options.authService);
    registerServiceRegistryRoutes(app, options.authService, new ServiceRegistryRepository(options.db), options.serviceCredentialService);
    registerApplicationInstanceRoutes(
      app,
      options.authService,
      new ApplicationInstanceService(
        options.db,
        options.applicationRegistrationTransport ?? new HttpsApplicationRegistrationTransport(),
      ),
    );
  }
  if (options.deviceService) registerDeviceRoutes(app, options.deviceService);
  if (options.hostService) registerHostRoutes(app, options.hostService);
  if (options.hostGrantService) registerHostGrantRoutes(app, options.hostGrantService);
  if (options.oauthService) {
    registerOAuthRoutes(app, options.oauthService);
    registerTrustedApplicationRoutes(app, new TrustedApplicationManagement(options.db));
  }
  if (options.serviceCredentialService) {
    registerServiceCredentialRoutes(app, options.serviceCredentialService);
  }

  return app;
}
