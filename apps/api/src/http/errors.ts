import type { FastifyReply } from "fastify";
import { AuthError } from "../auth/auth-service.js";
import { DeviceError } from "../devices/device-service.js";
import { HostError } from "../hosts/host-service.js";

export function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    if (error.retryAfterSeconds) reply.header("retry-after", String(error.retryAfterSeconds));
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  reply.log.error({ err: error }, "auth request failed");
  return reply.code(500).send({
    error: {
      code: "AUTH_INTERNAL_ERROR",
      message: "Authentication request failed",
    },
  });
}

export function sendHostError(reply: FastifyReply, error: unknown) {
  if (error instanceof HostError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
  if (error instanceof AuthError) {
    return reply.code(401).send({
      error: {
        code: "HOST_REAUTH_REQUIRED",
        message: "Re-authentication is required",
      },
    });
  }

  reply.log.error({ err: error }, "desktop host request failed");
  return reply.code(500).send({
    error: {
      code: "HOST_INTERNAL_ERROR",
      message: "Desktop Host request failed",
    },
  });
}

export function sendDeviceError(reply: FastifyReply, error: unknown) {
  if (error instanceof DeviceError) {
    return reply.code(error.statusCode).send({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }
  if (error instanceof AuthError) return sendAuthError(reply, error);

  reply.log.error({ err: error }, "device request failed");
  return reply.code(500).send({
    error: {
      code: "DEVICE_INTERNAL_ERROR",
      message: "Device request failed",
    },
  });
}
