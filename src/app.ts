import Fastify, { type FastifyInstance } from "fastify";
import type { DatabaseSync } from "node:sqlite";

export interface BuildAppOptions {
  db: DatabaseSync;
  logger?: boolean | object;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });

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

  return app;
}
