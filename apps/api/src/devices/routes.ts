import {
  registerDeviceRequestSchema,
  type RegisterDeviceRequest,
} from "@uichat-mira/cloud-auth-contracts";
import type { FastifyInstance } from "fastify";
import { readBearerToken } from "../http/bearer.js";
import { sendDeviceError } from "../http/errors.js";
import type { DeviceService } from "./device-service.js";

export function registerDeviceRoutes(app: FastifyInstance, deviceService: DeviceService): void {
  app.post<{ Body: RegisterDeviceRequest }>(
    "/v1/devices",
    async (request, reply) => {
      try {
        const token = readBearerToken(request);
        const parsed = registerDeviceRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: "DEVICE_INVALID_REQUEST",
              message: "Invalid Mira Device registration request",
            },
          });
        }
        return reply.code(200).send(deviceService.register(token, parsed.data));
      } catch (error) {
        return sendDeviceError(reply, error);
      }
    },
  );

  app.get("/v1/devices", async (request, reply) => {
    try {
      return reply.code(200).send({ devices: deviceService.list(readBearerToken(request)) });
    } catch (error) {
      return sendDeviceError(reply, error);
    }
  });
}
