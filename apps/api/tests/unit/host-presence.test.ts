import { describe, expect, it } from "vitest";
import { relayRoomSchema } from "@uichat-mira/cloud-auth-contracts";
import {
  createRelayRoom,
  hostAvailability,
  hostLeaseExpiresAt,
  type HostPresenceInput,
} from "../../src/hosts/host-presence.js";

const now = "2026-10-25T12:00:00.000Z";

function presence(overrides: Partial<HostPresenceInput> = {}): HostPresenceInput {
  return {
    now,
    leaseExpiresAt: "2026-10-25T12:02:00.000Z",
    hostRevokedAt: null,
    deviceRevokedAt: null,
    devicePlatform: "desktop",
    sessionRevokedAt: null,
    sessionExpiresAt: "2026-10-25T13:00:00.000Z",
    ...overrides,
  };
}

describe("Desktop Host presence", () => {
  it("is available only while the lease, session and device remain active", () => {
    expect(hostAvailability(presence())).toBe("available");
    expect(hostAvailability(presence({ leaseExpiresAt: now }))).toBe("offline");
    expect(hostAvailability(presence({ leaseExpiresAt: "2026-10-25T11:59:59.999Z" }))).toBe(
      "offline",
    );
    expect(hostAvailability(presence({ sessionExpiresAt: now }))).toBe("offline");
    expect(hostAvailability(presence({ hostRevokedAt: now }))).toBe("offline");
    expect(hostAvailability(presence({ deviceRevokedAt: now }))).toBe("offline");
    expect(hostAvailability(presence({ sessionRevokedAt: now }))).toBe("offline");
    expect(hostAvailability(presence({ devicePlatform: "mobile" }))).toBe("offline");
  });

  it("treats malformed times as offline rather than guessing readiness", () => {
    expect(hostAvailability(presence({ now: "not-a-time" }))).toBe("offline");
    expect(hostAvailability(presence({ leaseExpiresAt: "not-a-time" }))).toBe("offline");
    expect(hostAvailability(presence({ sessionExpiresAt: "not-a-time" }))).toBe("offline");
  });

  it("derives lease expiry from the server clock and generates unguessable rooms", () => {
    expect(hostLeaseExpiresAt(new Date(now), 120)).toBe("2026-10-25T12:02:00.000Z");
    const rooms = new Set(Array.from({ length: 64 }, () => createRelayRoom()));
    expect(rooms.size).toBe(64);
    for (const room of rooms) {
      expect(room).toMatch(/^room_[A-Za-z0-9_-]{43}$/);
      expect(relayRoomSchema.safeParse(room).success).toBe(true);
    }
  });
});
