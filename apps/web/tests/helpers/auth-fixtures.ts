import { expect } from "vitest";
import type { AuthStore } from "@/lib/auth/store";

export const account = { id: "account-1", username: "pilot" } as const;
export const expiresAt = "2026-11-01T00:00:00.000Z";

export function expectLoggedOutState(store: AuthStore): void {
  expect(store.getState()).toMatchObject({
    status: "unauthenticated",
    account: null,
    expiresAt: null,
    failure: null,
    pending: null,
  });
}

export function expectUnavailableState(
  store: AuthStore,
  kind = "service_unavailable",
): void {
  expect(store.getState()).toMatchObject({
    status: "unavailable",
    failure: { kind },
    pending: null,
  });
}
