import type { FastifyInstance, FastifyReply } from "fastify";
import { serviceIdSchema } from "@uichat-mira/cloud-auth-contracts";
import { AuthError } from "../auth/auth-service.js";
import { readBearerToken } from "../http/bearer.js";
import { ServiceRegistryError } from "../service-registry/repository.js";
import type { TrustedApplicationManagement } from "./management.js";

function failure(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError || error instanceof ServiceRegistryError) {
    return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});
  }
  return reply.code(500).send({error:{code:"APPLICATION_INTERNAL_ERROR",message:"Application request failed"}});
}
function id(value: string) {
  const parsed = serviceIdSchema.safeParse(value);
  if (!parsed.success) throw new ServiceRegistryError("APPLICATION_INVALID_DECLARATION", 400);
  return parsed.data;
}

export function registerTrustedApplicationRoutes(app: FastifyInstance, management: TrustedApplicationManagement) {
  app.get("/v1/application/services", async (request, reply) => {
    try { return reply.header("cache-control","no-store").send(management.list(readBearerToken(request))); }
    catch (error) { return failure(reply,error); }
  });
  app.put<{Params:{serviceId:string}}>("/v1/application/services/:serviceId", async (request, reply) => {
    try { return reply.header("cache-control","no-store").send(management.put(readBearerToken(request), id(request.params.serviceId), request.body)); }
    catch (error) { return failure(reply,error); }
  });
  app.post<{Params:{serviceId:string}}>("/v1/application/services/:serviceId/retire", async (request, reply) => {
    try { return reply.header("cache-control","no-store").send(management.retire(readBearerToken(request), id(request.params.serviceId), request.body)); }
    catch (error) { return failure(reply,error); }
  });
}
