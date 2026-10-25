import { registerHostRequestSchema } from "@uichat-mira/cloud-auth-contracts";
import type { FastifyInstance } from "fastify";
import { readBearerToken } from "../http/bearer.js";
import { sendHostError } from "../http/errors.js";
import type { HostService } from "./host-service.js";

export function registerHostRoutes(app: FastifyInstance, hostService: HostService): void {
  app.post("/v1/hosts", async (request, reply) => {
    try {
      const parsed = registerHostRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: "HOST_INVALID_REQUEST",
            message: "Invalid Desktop Host registration request",
          },
        });
      }
      return reply.code(200).send(hostService.register(readBearerToken(request)));
    } catch (error) {
      return sendHostError(reply, error);
    }
  });

  app.get("/v1/hosts", async (request, reply) => {
    try {
      return reply.code(200).send({
        hosts: hostService.list(readBearerToken(request)),
      });
    } catch (error) {
      return sendHostError(reply, error);
    }
  });
}
