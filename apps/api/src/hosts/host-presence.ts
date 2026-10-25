import { randomBytes } from "node:crypto";
import type { DesktopHostAvailability } from "@uichat-mira/cloud-auth-contracts";

export interface HostPresenceInput {
  now: string;
  leaseExpiresAt: string;
  hostRevokedAt: string | null;
  deviceRevokedAt: string | null;
  devicePlatform: string;
  sessionRevokedAt: string | null;
  sessionExpiresAt: string;
}

/**
 * A Host is available only while every server-side condition still holds.
 * Device registration, account login, and the last device `last_seen_at` are
 * intentionally absent from this decision.
 */
export function hostAvailability(input: HostPresenceInput): DesktopHostAvailability {
  const now = Date.parse(input.now);
  const leaseExpiresAt = Date.parse(input.leaseExpiresAt);
  const sessionExpiresAt = Date.parse(input.sessionExpiresAt);

  if (
    !Number.isFinite(now) ||
    !Number.isFinite(leaseExpiresAt) ||
    !Number.isFinite(sessionExpiresAt)
  ) {
    return "offline";
  }

  if (
    input.hostRevokedAt !== null ||
    input.deviceRevokedAt !== null ||
    input.sessionRevokedAt !== null ||
    input.devicePlatform !== "desktop"
  ) {
    return "offline";
  }

  return leaseExpiresAt > now && sessionExpiresAt > now ? "available" : "offline";
}

export function hostLeaseExpiresAt(now: Date, leaseTtlSeconds: number): string {
  return new Date(now.getTime() + leaseTtlSeconds * 1000).toISOString();
}

/**
 * Server-controlled room values are 256-bit random base64url identifiers.
 * `room_` keeps them distinguishable from legacy Relay room identifiers while
 * staying inside the canonical relay room alphabet.
 */
export function createRelayRoom(): string {
  return `room_${randomBytes(32).toString("base64url")}`;
}
