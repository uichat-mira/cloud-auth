import { describe, expect, it } from "vitest";
import {
  createHostGrantsClient,
  HostGrantsError,
  type CreateHostGrantsClientOptions,
  type HostGrantsFailure,
} from "@/lib/grants/client";
import {
  activeMobileId,
  effectiveScopes,
  grantHostId,
  hostAvailable,
  mobileActive,
  mutationResponse,
  snapshotGranted,
} from "../helpers/host-grants-fixtures";

interface RecordedRequest {
  url: string;
  init: RequestInit | undefined;
}

function clientReturning(
  response: Response | (() => Promise<Response>),
  requests: RecordedRequest[],
  options: Omit<CreateHostGrantsClientOptions, "fetch"> = {},
) {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return typeof response === "function" ? response() : response;
  }) as typeof globalThis.fetch;

  return createHostGrantsClient({ ...options, fetch: fetchImpl });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function captureFailure(action: Promise<unknown>): Promise<HostGrantsFailure> {
  try {
    await action;
  } catch (error) {
    expect(error).toBeInstanceOf(HostGrantsError);
    return (error as HostGrantsError).failure;
  }
  throw new Error("Expected the grants client to reject");
}

describe("Host grants client contract", () => {
  it("reads devices through an authenticated canonical schema", async () => {
    const requests: RecordedRequest[] = [];
    const client = clientReturning(jsonResponse({ devices: [mobileActive] }), requests, {
      baseUrl: "https://auth.example/",
    });

    await expect(client.listDevices("token-1")).resolves.toEqual([mobileActive]);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://auth.example/v1/devices");
    expect(requests[0]?.init?.method).toBe("GET");
    expect(requests[0]?.init?.headers).toMatchObject({
      accept: "application/json",
      authorization: "Bearer token-1",
    });
  });

  it("reads a durable owner-only management ledger without runtime grant proof fields", async () => {
    const requests: RecordedRequest[] = [];
    const entry = {
      host: {
        id: grantHostId,
        displayName: hostAvailable.displayName,
        clientVersion: hostAvailable.clientVersion,
        availability: "offline",
      },
      accountId: snapshotGranted.accountId,
      policyConfigured: true,
      policyScopes: snapshotGranted.policyScopes,
      revision: snapshotGranted.revision,
      grants: snapshotGranted.grants,
    };
    const client = clientReturning(jsonResponse({ hosts: [entry] }), requests);
    await expect(client.listManagement("token-1")).resolves.toEqual([entry]);
    expect(requests[0]?.url).toBe("/v1/hosts/grant-management");
    expect(requests[0]?.init?.headers).toMatchObject({
      authorization: "Bearer token-1",
    });
    const leakedProof = clientReturning(
      jsonResponse({ hosts: [{ ...entry, validUntil: snapshotGranted.validUntil }] }),
      [],
    );
    const invalid = await captureFailure(leakedProof.listManagement("token-1"));
    expect(invalid.kind).toBe("malformed_response");
  });

  it("narrows through the canonical PATCH body", async () => {
    const requests: RecordedRequest[] = [];
    const response = mutationResponse({
      revision: 5,
      scopes: ["threads:read"],
      status: "active",
    });
    const client = clientReturning(jsonResponse(response), requests);

    await expect(
      client.narrowGrant("token-1", grantHostId, activeMobileId, {
        expectedRevision: 4,
        scopes: ["threads:read"],
      }),
    ).resolves.toEqual(response);

    expect(requests[0]?.url).toBe(`/v1/hosts/${grantHostId}/grants/${activeMobileId}`);
    expect(requests[0]?.init?.method).toBe("PATCH");
    expect(requests[0]?.init?.headers).toMatchObject({
      accept: "application/json",
      authorization: "Bearer token-1",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      expectedRevision: 4,
      scopes: ["threads:read"],
    });
  });

  it("revokes through DELETE with an expected revision query", async () => {
    const requests: RecordedRequest[] = [];
    const response = mutationResponse({
      revision: 5,
      scopes: [],
      status: "revoked",
    });
    const client = clientReturning(jsonResponse(response), requests);

    await expect(client.revokeGrant("token-1", grantHostId, activeMobileId, 4)).resolves.toEqual(
      response,
    );

    expect(requests[0]?.url).toBe(
      `/v1/hosts/${grantHostId}/grants/${activeMobileId}?expectedRevision=4`,
    );
    expect(requests[0]?.init?.method).toBe("DELETE");
    expect(requests[0]?.init?.headers).toMatchObject({
      authorization: "Bearer token-1",
    });
  });

  it("classifies grant error envelopes by status and code", async () => {
    const cases = [
      [401, "HOST_GRANT_REAUTH_REQUIRED", "reauth_required"],
      [403, "HOST_GRANT_NOT_ALLOWED", "forbidden"],
      [404, "HOST_GRANT_NOT_FOUND", "not_found"],
      [409, "HOST_GRANT_STALE_REVISION", "stale_revision"],
      [409, "HOST_GRANT_CONFLICT", "conflict"],
      [400, "HOST_GRANT_INVALID_REQUEST", "invalid_request"],
      [500, "HOST_GRANT_INTERNAL_ERROR", "service_unavailable"],
    ] as const;

    for (const [status, code, kind] of cases) {
      const client = clientReturning(
        jsonResponse({ error: { code, message: "Canonical grant error" } }, status),
        [],
      );

      const failure = await captureFailure(client.listManagement("token-1"));
      expect(failure.status).toBe(status);
      expect(failure.code).toBe(code);
      expect(failure.kind).toBe(kind);
    }
  });

  it("treats a non-JSON 503 as service unavailable and a malformed success as malformed", async () => {
    const unavailable = clientReturning(
      new Response("<html>bad gateway</html>", { status: 503 }),
      [],
    );
    expect((await captureFailure(unavailable.listManagement("token-1"))).kind).toBe(
      "service_unavailable",
    );

    const malformed = clientReturning(jsonResponse({ hosts: "nope" }), []);
    expect((await captureFailure(malformed.listManagement("token-1"))).kind).toBe(
      "malformed_response",
    );
  });

  it("validates narrow and revoke requests before issuing a network call", async () => {
    const requests: RecordedRequest[] = [];
    const client = clientReturning(jsonResponse(snapshotGranted), requests);

    expect(
      (
        await captureFailure(
          client.narrowGrant("token-1", grantHostId, activeMobileId, {
            expectedRevision: -1,
            scopes: effectiveScopes,
          }),
        )
      ).kind,
    ).toBe("invalid_request");
    expect(
      (await captureFailure(client.revokeGrant("token-1", grantHostId, activeMobileId, 1.5))).kind,
    ).toBe("invalid_request");
    expect(requests).toHaveLength(0);
  });

  it("rejects a mutation that names a different Host or Mobile", async () => {
    const wrongMobile = clientReturning(
      jsonResponse(
        mutationResponse({
          revision: 5,
          scopes: ["threads:read"],
          status: "active",
          mobileDeviceId: "99999999-9999-4999-8999-999999999999",
        }),
      ),
      [],
    );
    expect(
      (
        await captureFailure(
          wrongMobile.narrowGrant("token-1", grantHostId, activeMobileId, {
            expectedRevision: 4,
            scopes: ["threads:read"],
          }),
        )
      ).kind,
    ).toBe("unexpected_response");
  });

  it("classifies transport failures as network unavailable", async () => {
    const client = clientReturning(() => Promise.reject(new TypeError("offline")), []);

    expect((await captureFailure(client.listManagement("token-1"))).kind).toBe(
      "network_unavailable",
    );
  });
});
