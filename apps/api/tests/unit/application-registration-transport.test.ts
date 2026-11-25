import { afterEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { HttpsApplicationRegistrationTransport, isPublicNetworkAddress } from "../../src/application-instances/transport.js";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe("application registration network boundary", () => {
  it("rejects private, loopback, link-local and documentation addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.1.2",
      "192.168.1.2",
      "169.254.1.1",
      "100.64.0.1",
      "198.51.100.7",
      "203.0.113.9",
      "::1",
      "fc00::1",
      "fd12::1",
      "fe80::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPublicNetworkAddress(address), address).toBe(false);
    }
  });

  it("accepts public IPv4 and global IPv6 addresses", () => {
    expect(isPublicNetworkAddress("1.1.1.1")).toBe(true);
    expect(isPublicNetworkAddress("8.8.8.8")).toBe(true);
    expect(isPublicNetworkAddress("2606:4700:4700::1111")).toBe(true);
  });
});

describe("registration transport admission and deadlines", () => {
  it("bounds outstanding DNS work and releases capacity only when it settles", async () => {
    vi.useFakeTimers();
    const resolveLookups: Array<() => void> = [];
    vi.mocked(lookup).mockImplementation((() => new Promise((resolve) => {
      resolveLookups.push(() => resolve([{ address: "127.0.0.1", family: 4 }]));
    })) as typeof lookup);
    const transport = new HttpsApplicationRegistrationTransport();
    const first = Array.from({ length: 8 }, () => transport.get("https://app.example"));
    const settled = Promise.allSettled(first);
    await expect(transport.get("https://app.example")).rejects.toMatchObject({ code: "BUSY" });
    await vi.advanceTimersByTimeAsync(5000);
    for (const result of await settled) {
      expect(result).toMatchObject({ status: "rejected", reason: { code: "NETWORK_ERROR" } });
    }
    await expect(transport.get("https://app.example")).rejects.toMatchObject({ code: "BUSY" });
    for (const resolve of resolveLookups) resolve();
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as never);
    await expect(transport.get("https://app.example")).rejects.toMatchObject({ code: "UNSAFE_TARGET" });
  });
});
