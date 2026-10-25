import type { DesktopHost } from "@uichat-mira/cloud-auth-contracts";
import type { AuthService } from "../auth/auth-service.js";
import { hashSessionSecret, parseSessionToken } from "../security/session-token.js";
import {
  hostAvailability,
  hostLeaseExpiresAt,
  type HostPresenceInput,
} from "./host-presence.js";
import type { HostRecord, HostRepository } from "./host-repository.js";

export type HostErrorCode =
  | "HOST_REAUTH_REQUIRED"
  | "HOST_REGISTRATION_NOT_ALLOWED";

export class HostError extends Error {
  constructor(
    readonly code: HostErrorCode,
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export interface HostServiceOptions {
  leaseTtlSeconds: number;
  now?: () => Date;
}

export interface HostRoomOwnership {
  hostId: string;
  accountId: string;
  deviceId: string;
  relayRoom: string;
  availability: "available" | "offline";
  lastAdvertisedAt: string;
  leaseExpiresAt: string;
}

export class HostService {
  private readonly now: () => Date;

  constructor(
    private readonly repository: HostRepository,
    private readonly authService: AuthService,
    private readonly options: HostServiceOptions,
  ) {
    this.now = options.now ?? (() => new Date());
  }

  register(token: string): DesktopHost {
    const parsed = parseSessionToken(token);
    if (!parsed) throw unauthorized();

    const now = this.now();
    const result = this.repository.registerHost({
      sessionId: parsed.id,
      sessionSecretHash: hashSessionSecret(parsed.secret),
      now: now.toISOString(),
      leaseExpiresAt: hostLeaseExpiresAt(now, this.options.leaseTtlSeconds),
    });

    if (!result.ok) {
      if (result.reason === "not_approved") {
        throw new HostError(
          "HOST_REGISTRATION_NOT_ALLOWED",
          403,
          "This Cloud Session is not an approved Mira Desktop Host",
        );
      }
      throw unauthorized();
    }

    return publicHost(result.value, now.toISOString());
  }

  list(token: string): DesktopHost[] {
    const account = this.authService.requireAccountIdentity(token);
    const now = this.now().toISOString();
    return this.repository
      .listByAccount(account.id)
      .map((host) => publicHost(host, now));
  }

  /**
   * Server-side input for OPS-019 room entitlement and G2 Host Grant.
   * Returning null means the room has no current owner; a non-null result may
   * still have `availability: "offline"` and must not be treated as online.
   */
  resolveRoomOwnership(relayRoom: string): HostRoomOwnership | null {
    const host = this.repository.findOwnershipByRoom(relayRoom);
    if (!host) return null;
    return {
      hostId: host.id,
      accountId: host.accountId,
      deviceId: host.deviceId,
      relayRoom: host.relayRoom,
      availability: availabilityFor(host, this.now().toISOString()),
      lastAdvertisedAt: host.advertisedAt,
      leaseExpiresAt: host.leaseExpiresAt,
    };
  }
}

function unauthorized(): HostError {
  return new HostError(
    "HOST_REAUTH_REQUIRED",
    401,
    "Re-authentication is required",
  );
}

function publicHost(host: HostRecord, now: string): DesktopHost {
  return {
    id: host.id,
    deviceId: host.deviceId,
    displayName: host.clientName,
    clientVersion: host.clientVersion,
    availability: availabilityFor(host, now),
    relayRoom: host.relayRoom,
    registeredAt: host.createdAt,
    lastAdvertisedAt: host.advertisedAt,
    leaseExpiresAt: host.leaseExpiresAt,
  };
}

function availabilityFor(host: HostRecord, now: string) {
  const input: HostPresenceInput = {
    now,
    leaseExpiresAt: host.leaseExpiresAt,
    hostRevokedAt: host.revokedAt,
    deviceRevokedAt: host.deviceRevokedAt,
    devicePlatform: host.devicePlatform,
    sessionRevokedAt: host.sessionRevokedAt,
    sessionExpiresAt: host.sessionExpiresAt,
  };
  return hostAvailability(input);
}
