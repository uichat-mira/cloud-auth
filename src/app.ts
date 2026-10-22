import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import type { AuthService } from "./auth/auth-service.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { registerAcceptanceUi } from "./acceptance-page.js";

export interface BuildAppOptions {
  db: DatabaseSync;
  authService?: AuthService;
  logger?: boolean | object;
  trustProxy?: boolean;
  acceptanceUi?: boolean;
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
  if (options.acceptanceUi) registerAcceptanceUi(app);

  return app;
}
