import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserSessionStorage } from "@/lib/auth/session-storage";

const storageKey = "mira.test.session";

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("browser session storage adapter", () => {
  it("persists and restores the Cloud Session credential", () => {
    const adapter = createBrowserSessionStorage({
      key: storageKey,
      storage: window.sessionStorage,
    });
    const session = {
      sessionToken: "mcs_v1.session.secret",
      expiresAt: "2026-11-01T00:00:00.000Z",
    };

    adapter.save(session);

    expect(adapter.load()).toEqual(session);
    expect(window.sessionStorage.getItem(storageKey)).toBe(JSON.stringify(session));
  });

  it("returns null and removes malformed persisted state", () => {
    const adapter = createBrowserSessionStorage({
      key: storageKey,
      storage: window.sessionStorage,
    });
    window.sessionStorage.setItem(storageKey, '{"sessionToken":"missing-expiry"}');

    expect(adapter.load()).toBeNull();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("returns null and removes non-JSON persisted state", () => {
    const adapter = createBrowserSessionStorage({
      key: storageKey,
      storage: window.sessionStorage,
    });
    window.sessionStorage.setItem(storageKey, "not-json");

    expect(adapter.load()).toBeNull();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();
  });

  it("clears a persisted session", () => {
    const adapter = createBrowserSessionStorage({
      key: storageKey,
      storage: window.sessionStorage,
    });
    adapter.save({
      sessionToken: "mcs_v1.session.secret",
      expiresAt: "2026-11-01T00:00:00.000Z",
    });

    adapter.clear();

    expect(adapter.load()).toBeNull();
  });
});
