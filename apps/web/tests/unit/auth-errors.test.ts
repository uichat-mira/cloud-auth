import { describe, expect, it } from "vitest";
import {
  CloudAuthError,
  createAuthFailure,
  failureFromErrorResponse,
  parseRetryAfterSeconds,
  toAuthFailure,
} from "@/lib/auth/errors";

function envelope(code: string) {
  return { error: { code, message: "contract message" } };
}

describe("auth failure classification", () => {
  it("maps canonical 401 errors", () => {
    expect(
      failureFromErrorResponse(401, envelope("AUTH_REAUTH_REQUIRED"), null).kind,
    ).toBe("reauth_required");
    expect(
      failureFromErrorResponse(401, envelope("AUTH_INVALID_CREDENTIALS"), null)
        .kind,
    ).toBe("invalid_credentials");
  });

  it("maps rate limiting and transient service states", () => {
    const rateLimited = failureFromErrorResponse(
      429,
      envelope("AUTH_RATE_LIMITED"),
      12,
    );
    expect(rateLimited.kind).toBe("rate_limited");
    expect(rateLimited.retryAfterSeconds).toBe(12);

    expect(failureFromErrorResponse(503, envelope("AUTH_BUSY"), null).kind).toBe(
      "service_unavailable",
    );
  });

  it("classifies malformed error payloads without throwing", () => {
    expect(failureFromErrorResponse(401, { error: "nope" }, null).kind).toBe(
      "malformed_response",
    );
    expect(failureFromErrorResponse(500, null, null).kind).toBe(
      "malformed_response",
    );
  });

  it("parses only non-negative integer retry-after headers", () => {
    expect(parseRetryAfterSeconds("30")).toBe(30);
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds("-1")).toBeNull();
    expect(parseRetryAfterSeconds("later")).toBeNull();
  });

  it("preserves CloudAuthError failures and wraps unknown errors", () => {
    const failure = createAuthFailure("network_unavailable");
    expect(toAuthFailure(new CloudAuthError(failure))).toBe(failure);
    expect(toAuthFailure(new Error("boom")).kind).toBe("unexpected_response");
  });
});
