import { z } from "zod";
import { relayRoomSchema } from "./service-credential.js";

/**
 * Host presence is derived from a fresh registration lease, never from device
 * registration, account login, or a previous Relay connection. `available`
 * means the server observed a current Host lease and the owning Cloud Session,
 * Mira Device and account are still active. It still does not prove that the
 * Host is reachable over the network.
 */
export const desktopHostAvailabilitySchema = z.enum(["available", "offline"]);

export const desktopHostSchema = z
  .object({
    id: z.string().min(1),
    deviceId: z.string().min(1),
    displayName: z.string().min(1).max(80).nullable(),
    clientVersion: z.string().min(1).max(64).nullable(),
    availability: desktopHostAvailabilitySchema,
    relayRoom: relayRoomSchema,
    registeredAt: z.iso.datetime(),
    lastAdvertisedAt: z.iso.datetime(),
    leaseExpiresAt: z.iso.datetime(),
  })
  .strict();

export const desktopHostListResponseSchema = z
  .object({
    hosts: z.array(desktopHostSchema),
  })
  .strict();

/**
 * Host registration is server-driven. The caller may not choose its account,
 * device, relay room, role, or availability; an empty body is the only accepted
 * intent payload.
 */
export const registerHostRequestSchema = z.object({}).strict();

export const hostErrorCodeSchema = z.enum([
  "HOST_INVALID_REQUEST",
  "HOST_REAUTH_REQUIRED",
  "HOST_REGISTRATION_NOT_ALLOWED",
  "HOST_INTERNAL_ERROR",
]);

export const hostErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: hostErrorCodeSchema,
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type DesktopHostAvailability = z.infer<typeof desktopHostAvailabilitySchema>;
export type DesktopHost = z.infer<typeof desktopHostSchema>;
export type DesktopHostListResponse = z.infer<typeof desktopHostListResponseSchema>;
export type RegisterHostRequest = z.infer<typeof registerHostRequestSchema>;
export type HostErrorCode = z.infer<typeof hostErrorCodeSchema>;
export type HostErrorEnvelope = z.infer<typeof hostErrorEnvelopeSchema>;
