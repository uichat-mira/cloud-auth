import type { FastifyInstance, FastifyReply } from "fastify";
import { developerApplicationCreateSchema, developerApplicationActionSchema, serviceIdSchema } from "@uichat-mira/cloud-auth-contracts";
import { AuthError, type AuthService } from "../auth/auth-service.js";
import { readBearerToken } from "../http/bearer.js";
import { ServiceRegistryError } from "../service-registry/repository.js";
import type { TrustedApplicationManagement } from "./management.js";

function failure(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError || error instanceof ServiceRegistryError) {
    if (error instanceof AuthError && error.retryAfterSeconds !== undefined) reply.header("retry-after",error.retryAfterSeconds);
    return reply.code(error.statusCode).send({error:{code:error.code,message:error.message}});
  }
  return reply.code(500).send({error:{code:"APPLICATION_INTERNAL_ERROR",message:"Application request failed"}});
}

/** Portal uses explicit Cloud Session Authorization, never cookie authority or
 * the application's own bearer. JSON mutations require the current password. */
export function registerApplicationOwnerRoutes(app: FastifyInstance, auth: AuthService, management: TrustedApplicationManagement) {
  app.get("/v1/account/applications", async (request, reply) => {
    reply.header("cache-control","no-store");
    try {
      const token = readBearerToken(request);
      return reply.send(management.ownerCatalog(() => auth.requireAccountIdentity(token).id));
    } catch (error) { return failure(reply,error); }
  });
  app.post("/v1/account/applications", async (request, reply) => {
    reply.header("cache-control","no-store");
    try {
      const token = readBearerToken(request);
      const body = developerApplicationCreateSchema.safeParse(request.body);
      if (!body.success) throw new ServiceRegistryError("APPLICATION_INVALID_DECLARATION",400);
      await auth.verifyApplicationOwnerPassword(token,body.data.currentPassword,request.ip);
      const {currentPassword: _password, ...metadata} = body.data;
      return reply.send(management.ownerCreate(() => auth.requireAccountIdentity(token).id,metadata));
    } catch (error) { return failure(reply,error); }
  });
  for (const action of ["rotate","disable","enable"] as const) {
    app.post<{Params:{clientId:string}}>("/v1/account/applications/:clientId/" + action, async (request, reply) => {
      reply.header("cache-control","no-store");
      try {
        const token = readBearerToken(request);
        const clientId = serviceIdSchema.safeParse(request.params.clientId);
        const body = developerApplicationActionSchema.safeParse(request.body);
        if (!clientId.success || !body.success) throw new ServiceRegistryError("APPLICATION_INVALID_DECLARATION",400);
        await auth.verifyApplicationOwnerPassword(token,body.data.currentPassword,request.ip);
        return reply.send(management.ownerAction(() => auth.requireAccountIdentity(token).id,clientId.data,action));
      } catch (error) { return failure(reply,error); }
    });
  }
}
