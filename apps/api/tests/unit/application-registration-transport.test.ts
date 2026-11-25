import { describe, expect, it } from "vitest";
import { isPublicNetworkAddress } from "../../src/application-instances/transport.js";

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
