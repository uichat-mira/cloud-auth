import {
  deviceIdSchema,
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

  app.delete<{ Params: { deviceId: string } }>(
    "/v1/devices/:deviceId",
    async (request, reply) => {
      try {
        const token = readBearerToken(request);
        if (!deviceIdSchema.safeParse(request.params.deviceId).success) {
          return reply.code(404).send({
            error: {
              code: "DEVICE_NOT_FOUND",
              message: "Mira Device not found",
            },
          });
        }
        return reply.code(200).send(deviceService.revoke(token, request.params.deviceId));
      } catch (error) {
        return sendDeviceError(reply, error);
      }
    },
  );
}
