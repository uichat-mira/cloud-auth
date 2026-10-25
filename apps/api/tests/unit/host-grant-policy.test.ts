import { describe, expect, it } from "vitest";
import {
  REMOTE_DEVICE_SCOPES,
  canonicalRemoteDeviceScopes,
  remoteDeviceScopeSchema,
} from "@uichat-mira/cloud-auth-contracts";
import {
  effectiveGrantScopes,
  grantWindow,
  intersectGrantScopes,
  isGrantScopeSubset,
} from "../../src/grants/grant-policy.js";

describe("Host grant policy", () => {
  it("keeps the canonical Desktop Remote V1 scope whitelist", () => {
    expect(REMOTE_DEVICE_SCOPES).toEqual([
      "threads:read",
      "messages:read",
      "messages:write",
      "agent:read",
      "agent:approve",
      "agent:control",
      "tools:read",
      "tools:invoke",
      "tools:approve",
      "tools:control",
      "artifacts:read",
    ]);
    expect(remoteDeviceScopeSchema.safeParse("relay:transport").success).toBe(false);
    expect(remoteDeviceScopeSchema.safeParse("*").success).toBe(false);
    expect(remoteDeviceScopeSchema.safeParse("tools:*").success).toBe(false);
  });

  it("canonicalizes duplicate scopes and rejects order drift", () => {
    expect(
      canonicalRemoteDeviceScopes([
        "tools:invoke",
        "threads:read",
        "tools:invoke",
        "messages:write",
      ]),
    ).toEqual(["threads:read", "messages:write", "tools:invoke"]);
  });

  it("inherits the Host ceiling by default and never widens an override", () => {
    const policy = ["threads:read", "tools:read", "tools:invoke"] as const;

    expect(effectiveGrantScopes(policy, null)).toEqual([
      "threads:read",
      "tools:read",
      "tools:invoke",
    ]);
    expect(
      effectiveGrantScopes(policy, {
        scopes: ["tools:read"],
        revokedAt: null,
        updatedAt: "2026-10-25T00:00:00.000Z",
      }),
    ).toEqual(["tools:read"]);
    expect(
      effectiveGrantScopes(policy, {
        scopes: ["tools:invoke"],
        revokedAt: "2026-10-25T00:00:00.000Z",
        updatedAt: "2026-10-25T00:00:00.000Z",
      }),
    ).toEqual([]);
  });

  it("detects widening and narrows stored overrides deterministically", () => {
    const ceiling = ["threads:read", "tools:read"] as const;
    expect(isGrantScopeSubset(["tools:read"], ceiling)).toBe(true);
    expect(isGrantScopeSubset(["tools:read", "tools:invoke"], ceiling)).toBe(false);
    expect(
      intersectGrantScopes(["threads:read", "tools:invoke"], ceiling),
    ).toEqual(["threads:read"]);
  });

  it("issues a bounded server validity window", () => {
    const now = new Date("2026-10-25T12:00:00.000Z");
    expect(grantWindow(now, 300)).toEqual({
      issuedAt: "2026-10-25T12:00:00.000Z",
      validUntil: "2026-10-25T12:05:00.000Z",
      maxStalenessSeconds: 300,
    });
  });
});
