import type { DevicePlatform, RelayTicketContext } from "@uichat-mira/cloud-auth-contracts";

export interface RelayAdmissionAuthority {
  accountId: string;
  deviceId: string;
  devicePlatform: DevicePlatform;
}

export interface RelayRoomOwnership {
  accountId: string;
  deviceId: string;
  availability: "available" | "offline";
}

/**
 * Server-side Relay transport admission. Caller-supplied role and room are
 * checked against the authoritative Host room association and the device bound
 * to the current Cloud Session; neither value is trusted on its own.
 */
export function isRelayTicketAuthorized(
  request: RelayTicketContext,
  authority: RelayAdmissionAuthority,
  ownership: RelayRoomOwnership | null,
): boolean {
  if (!ownership || ownership.availability !== "available") return false;
  if (ownership.accountId !== authority.accountId) return false;

  if (request.role === "host") {
    return (
      authority.devicePlatform === "desktop" &&
      authority.deviceId === ownership.deviceId
    );
  }

  return authority.devicePlatform === "mobile";
}
