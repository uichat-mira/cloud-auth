import { describe, expect, it } from "vitest";
import {
  isRelayTicketAuthorized,
  type RelayAdmissionAuthority,
  type RelayRoomOwnership,
} from "../../src/service-credentials/relay-admission.js";

const authority: RelayAdmissionAuthority = {
  accountId: "account-alice",
  deviceId: "device-host",
  devicePlatform: "desktop",
};

const availableRoom: RelayRoomOwnership = {
  relayRoom: "room_alice",
  accountId: "account-alice",
  deviceId: "device-host",
  availability: "available",
};

describe("Relay ticket admission matrix", () => {
  it("authorizes only the bound Desktop Host device for host transport", () => {
    expect(
      isRelayTicketAuthorized({ room: "room_alice", role: "host" }, authority, availableRoom),
    ).toBe(true);
    expect(
      isRelayTicketAuthorized(
        { room: "room_alice", role: "host" },
        { ...authority, deviceId: "device-other-desktop" },
        availableRoom,
      ),
    ).toBe(false);
    expect(
      isRelayTicketAuthorized(
        { room: "room_alice", role: "host" },
        { ...authority, accountId: "account-bob" },
        availableRoom,
      ),
    ).toBe(false);
    expect(
      isRelayTicketAuthorized(
        { room: "room_alice", role: "host" },
        { ...authority, devicePlatform: "mobile" },
        availableRoom,
      ),
    ).toBe(false);
  });

  it("authorizes only a same-account Mobile device for client transport", () => {
    const mobile: RelayAdmissionAuthority = {
      accountId: "account-alice",
      deviceId: "device-mobile",
      devicePlatform: "mobile",
    };

    expect(
      isRelayTicketAuthorized({ room: "room_alice", role: "client" }, mobile, availableRoom),
    ).toBe(true);
    expect(
      isRelayTicketAuthorized(
        { room: "room_alice", role: "client" },
        { ...mobile, accountId: "account-bob" },
        availableRoom,
      ),
    ).toBe(false);
    expect(
      isRelayTicketAuthorized(
        { room: "room_alice", role: "client" },
        { ...mobile, devicePlatform: "desktop" },
        availableRoom,
      ),
    ).toBe(false);
  });

  it("fails closed for unknown, offline, revoked or foreign rooms", () => {
    const mobile: RelayAdmissionAuthority = {
      accountId: "account-alice",
      deviceId: "device-mobile",
      devicePlatform: "mobile",
    };

    for (const ownership of [
      null,
      { ...availableRoom, availability: "offline" as const },
      { ...availableRoom, accountId: "account-bob" },
    ]) {
      expect(
        isRelayTicketAuthorized({ room: "room_alice", role: "client" }, mobile, ownership),
      ).toBe(false);
      expect(
        isRelayTicketAuthorized({ room: "room_alice", role: "host" }, authority, ownership),
      ).toBe(false);
    }
  });

  it("rejects requests whose room differs from the ownership record", () => {
    expect(
      isRelayTicketAuthorized(
        { room: "room_someone-else", role: "host" },
        authority,
        availableRoom,
      ),
    ).toBe(false);
    expect(
      isRelayTicketAuthorized(
        { room: "room_someone-else", role: "client" },
        { ...authority, devicePlatform: "mobile" },
        availableRoom,
      ),
    ).toBe(false);
    expect(
      isRelayTicketAuthorized(
        { room: "room_alice", role: "host" },
        authority,
        { ...availableRoom, deviceId: "device-other-host" },
      ),
    ).toBe(false);
  });
});
