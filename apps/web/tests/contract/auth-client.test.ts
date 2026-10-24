import { describe, expect, it } from "vitest";
import {
  cloudSessionSchema,
  issuedCloudSessionSchema,
  type CloudSession,
  type IssuedCloudSession,
} from "@uichat-mira/cloud-auth-contracts";
import {
  createCloudAuthClient,
  type CreateCloudAuthClientOptions,
} from "@/lib/auth/client";
import { CloudAuthError, type AuthFailure } from "@/lib/auth/errors";
import {
  account,
  expiresAt,
  issuedSession,
} from "../helpers/auth-fixtures";

const issued = issuedCloudSessionSchema.parse(
  issuedSession("mcs_v1.session.secret"),
);
const restored = cloudSessionSchema.parse({ account, expiresAt });

interface RecordedRequest {
  url: string;
  init: RequestInit | undefined;
}

function clientReturning(
  response: Response | (() => Promise<Response>),
  requests: RecordedRequest[],
  options: Omit<CreateCloudAuthClientOptions, "fetch"> = {},
) {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return typeof response === "function" ? response() : response;
  }) as typeof globalThis.fetch;

  return createCloudAuthClient({ ...options, fetch: fetchImpl });
}

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

async function captureFailure(action: Promise<unknown>): Promise<AuthFailure> {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(CloudAuthError);
    return (error as CloudAuthError).failure;
  }
  throw new Error("Expected the client to reject");
}

describe("Cloud Auth client contract", () => {
  it("posts the canonical login request and validates the issued session", async () => {
    const requests: RecordedRequest[] = [];
    const client = clientReturning(jsonResponse(issued), requests, {
      baseUrl: "https://auth.example/",
    });

    const result: IssuedCloudSession = await client.login({
      username: "pilot",
      password: "correct horse battery staple",
    });

    expect(result).toEqual(issued);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://auth.example/v1/auth/login");
    expect(requests[0]?.init?.method).toBe("POST");
    expect(requests[0]?.init?.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      username: "pilot",
      password: "correct horse battery staple",
    });
  });

  it("restores and renews through bearer sessions using canonical responses", async () => {
    const requests: RecordedRequest[] = [];
    const client = clientReturning(jsonResponse(restored), requests);

    const session: CloudSession = await client.getSession("token-1");
    expect(session).toEqual(restored);
    expect(requests[0]?.url).toBe("/v1/auth/session");
    expect(requests[0]?.init?.headers).toMatchObject({
      authorization: "Bearer token-1",
    });

    const renewingClient = clientReturning(jsonResponse(issued), requests);
    const renewed: IssuedCloudSession = await renewingClient.renewSession("token-1");
    expect(renewed).toEqual(issued);
    expect(requests[1]?.url).toBe("/v1/auth/session/renew");
    expect(requests[1]?.init?.method).toBe("POST");
    expect(requests[1]?.init?.headers).toMatchObject({
      authorization: "Bearer token-1",
    });
  });

  it("accepts the canonical 204 logout response", async () => {
    const requests: RecordedRequest[] = [];
    const client = clientReturning(new Response(null, { status: 204 }), requests);

    await expect(client.logout("token-1")).resolves.toBeUndefined();
    expect(requests[0]?.url).toBe("/v1/auth/logout");
    expect(requests[0]?.init?.headers).toMatchObject({
      authorization: "Bearer token-1",
    });
  });

  it("classifies canonical auth error envelopes", async () => {
    const cases = [
      [401, "AUTH_REAUTH_REQUIRED", "reauth_required"],
      [401, "AUTH_INVALID_CREDENTIALS", "invalid_credentials"],
      [429, "AUTH_RATE_LIMITED", "rate_limited"],
      [503, "AUTH_BUSY", "service_unavailable"],
      [500, "AUTH_INTERNAL_ERROR", "unexpected_response"],
    ] as const;

    for (const [status, code, kind] of cases) {
      const requests: RecordedRequest[] = [];
      const client = clientReturning(
        jsonResponse(
          {
            error: {
              code,
              message: "Canonical auth error",
            },
          },
          status,
        ),
        requests,
      );

      const failure = await captureFailure(client.login({ username: "pilot", password: "x" }));
      expect(failure.status).toBe(status);
      expect(failure.code).toBe(code);
      expect(failure.kind).toBe(kind);
    }
  });

  it("surfaces retry-after for rate limiting", async () => {
    const client = clientReturning(
      jsonResponse(
        {
          error: {
            code: "AUTH_RATE_LIMITED",
            message: "Too many login attempts",
          },
        },
        429,
        { "retry-after": "30" },
      ),
      [],
    );

    const failure = await captureFailure(client.login({ username: "pilot", password: "x" }));
    expect(failure.retryAfterSeconds).toBe(30);
  });

  it("treats schema-invalid success and error bodies as malformed responses", async () => {
    const invalidSuccess = clientReturning(
      jsonResponse({ sessionToken: "mcs_v1.session.secret" }),
      [],
    );
    expect(
      (await captureFailure(invalidSuccess.login({ username: "pilot", password: "x" })))
        .kind,
    ).toBe("malformed_response");

    const invalidError = clientReturning(
      jsonResponse({ error: { code: "AUTH_REAUTH_REQUIRED" } }, 401),
      [],
    );
    expect((await captureFailure(invalidError.getSession("token-1"))).kind).toBe(
      "malformed_response",
    );
  });

  it("classifies transport failures as network unavailable", async () => {
    const client = clientReturning(() => Promise.reject(new TypeError("offline")), []);

    expect((await captureFailure(client.getSession("token-1"))).kind).toBe(
      "network_unavailable",
    );
  });
});
