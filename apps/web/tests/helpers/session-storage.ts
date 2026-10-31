import type { PersistedCloudSession, SessionStorageAdapter } from "@/lib/auth/session-storage";

export function createMemoryStorage(initial: PersistedCloudSession | null = null) {
  let current = initial;

  return {
    load: () => current,
    save: (session: PersistedCloudSession) => {
      current = session;
    },
    clear: () => {
      current = null;
    },
  } satisfies SessionStorageAdapter;
}
