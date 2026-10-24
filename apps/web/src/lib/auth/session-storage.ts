import { z } from "zod";

const DEFAULT_STORAGE_KEY = "mira.cloud-auth.session.v1";

const persistedSessionSchema = z
  .object({
    sessionToken: z.string().min(1),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export type PersistedCloudSession = z.infer<typeof persistedSessionSchema>;

export interface SessionStorageAdapter {
  load(): PersistedCloudSession | null;
  save(session: PersistedCloudSession): void;
  clear(): void;
}

export interface BrowserSessionStorageOptions {
  key?: string;
  storage?: Storage;
}

export function createBrowserSessionStorage(
  options: BrowserSessionStorageOptions = {},
): SessionStorageAdapter {
  const key = options.key ?? DEFAULT_STORAGE_KEY;
  const storage = options.storage ?? browserStorage();

  return {
    load() {
      const raw = readItem(storage, key);
      if (raw === null) return null;

      const parsed = parsePersistedSession(raw);
      if (!parsed) {
        storage.removeItem(key);
        return null;
      }
      return parsed;
    },
    save(session) {
      storage.setItem(key, JSON.stringify(persistedSessionSchema.parse(session)));
    },
    clear() {
      storage.removeItem(key);
    },
  };
}

function browserStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error("Browser session storage is unavailable outside a browser");
  }
  return window.sessionStorage;
}

function readItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function parsePersistedSession(raw: string): PersistedCloudSession | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsed = persistedSessionSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
