export interface LoginGuardOptions {
  maxConcurrentHashes: number;
  perUsernamePerMinute: number;
  perIpPerMinute: number;
}

interface Bucket {
  startedAtMs: number;
  count: number;
}

export type LoginGuardDecision =
  | { allowed: true; releaseHashSlot: () => void }
  | { allowed: false; code: "rate_limited"; retryAfterSeconds: number }
  | { allowed: false; code: "busy"; retryAfterSeconds: number };

export class LoginGuard {
  private readonly buckets = new Map<string, Bucket>();
  private activeHashes = 0;
  private lastPruneAtMs = 0;
  private static readonly WINDOW_MS = 60_000;
  private static readonly MAX_BUCKETS = 20_000;

  constructor(private readonly options: LoginGuardOptions) {}

  begin(usernameNormalized: string, ip: string, nowMs = Date.now()): LoginGuardDecision {
    this.pruneExpired(nowMs);
    const usernameKey = `username:${usernameNormalized}`;
    const ipKey = `ip:${ip}`;

    const usernameResult = this.consume(usernameKey, this.options.perUsernamePerMinute, nowMs);
    if (!usernameResult.allowed) return usernameResult;

    const ipResult = this.consume(ipKey, this.options.perIpPerMinute, nowMs);
    if (!ipResult.allowed) return ipResult;

    if (this.activeHashes >= this.options.maxConcurrentHashes) {
      return { allowed: false, code: "busy", retryAfterSeconds: 1 };
    }

    this.activeHashes += 1;
    let released = false;
    return {
      allowed: true,
      releaseHashSlot: () => {
        if (released) return;
        released = true;
        this.activeHashes -= 1;
      },
    };
  }

  resetAfterSuccess(usernameNormalized: string): void {
    // A successful login may clear the account-local failed-attempt history, but it must
    // not reset the shared IP bucket or one known credential could bypass spray limits.
    this.buckets.delete(`username:${usernameNormalized}`);
  }

  private consume(
    key: string,
    maxAttempts: number,
    nowMs: number,
  ): { allowed: true } | { allowed: false; code: "rate_limited"; retryAfterSeconds: number } {
    const minuteMs = LoginGuard.WINDOW_MS;
    const current = this.buckets.get(key);
    if (!current || nowMs - current.startedAtMs >= minuteMs) {
      if (!current && this.buckets.size >= LoginGuard.MAX_BUCKETS) {
        return { allowed: false, code: "rate_limited", retryAfterSeconds: 60 };
      }
      this.buckets.set(key, { startedAtMs: nowMs, count: 1 });
      return { allowed: true };
    }

    if (current.count >= maxAttempts) {
      const remainingMs = Math.max(1, minuteMs - (nowMs - current.startedAtMs));
      return {
        allowed: false,
        code: "rate_limited",
        retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
      };
    }

    current.count += 1;
    return { allowed: true };
  }

  private pruneExpired(nowMs: number): void {
    if (this.buckets.size < LoginGuard.MAX_BUCKETS / 2) return;
    if (nowMs - this.lastPruneAtMs < LoginGuard.WINDOW_MS / 4) return;

    this.lastPruneAtMs = nowMs;
    for (const [key, bucket] of this.buckets) {
      if (nowMs - bucket.startedAtMs >= LoginGuard.WINDOW_MS) {
        this.buckets.delete(key);
      }
    }
  }
}
