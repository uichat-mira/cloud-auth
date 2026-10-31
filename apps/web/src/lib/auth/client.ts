import {
  cloudSessionSchema,
  issuedCloudSessionSchema,
  type ChangePasswordRequest,
  type CloudSession,
  type IssuedCloudSession,
  type LoginRequest,
} from "@uichat-mira/cloud-auth-contracts";
import {
  authenticatedRequest,
  bearerHeaders,
  createHttpTransport,
  type FailedResponse,
} from "@/lib/http/transport";
import {
  CloudAuthError,
  createAuthFailure,
  failureFromErrorResponse,
  parseRetryAfterSeconds,
} from "./errors";

export interface CloudAuthClient {
  login(request: LoginRequest): Promise<IssuedCloudSession>;
  getSession(sessionToken: string): Promise<CloudSession>;
  renewSession(sessionToken: string): Promise<IssuedCloudSession>;
  changePassword(sessionToken: string, request: ChangePasswordRequest): Promise<void>;
  logout(sessionToken: string): Promise<void>;
}

export interface CreateCloudAuthClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createCloudAuthClient(options: CreateCloudAuthClientOptions = {}): CloudAuthClient {
  const transport = createHttpTransport({
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    hooks: {
      networkUnavailable: () => new CloudAuthError(createAuthFailure("network_unavailable")),
      malformedResponse: (status) =>
        new CloudAuthError(createAuthFailure("malformed_response", { status })),
      responseFailed: failedResponseToError,
    },
  });

  function login(request: LoginRequest): Promise<IssuedCloudSession> {
    return transport.json(
      "/v1/auth/login",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      },
      issuedCloudSessionSchema,
    );
  }

  function getSession(sessionToken: string): Promise<CloudSession> {
    return transport.json(
      "/v1/auth/session",
      authenticatedRequest("GET", sessionToken),
      cloudSessionSchema,
    );
  }

  function renewSession(sessionToken: string): Promise<IssuedCloudSession> {
    return transport.json(
      "/v1/auth/session/renew",
      authenticatedRequest("POST", sessionToken),
      issuedCloudSessionSchema,
    );
  }

  function logout(sessionToken: string): Promise<void> {
    return transport.empty("/v1/auth/logout", authenticatedRequest("POST", sessionToken), 204);
  }

  function changePassword(sessionToken: string, request: ChangePasswordRequest): Promise<void> {
    return transport.empty(
      "/v1/auth/password",
      {
        method: "POST",
        headers: {
          ...bearerHeaders(sessionToken),
          "content-type": "application/json",
        },
        body: JSON.stringify(request),
      },
      204,
    );
  }

  return { login, getSession, renewSession, changePassword, logout };
}

/**
 * Auth failures are classified from the canonical `AUTH_*` envelope; the
 * `Retry-After` header is kept so the UI can count down a rate limit. A
 * non-JSON body cannot carry that envelope, which is itself a malformed
 * response rather than a policy decision.
 */
function failedResponseToError(response: FailedResponse): CloudAuthError {
  if (!response.bodyParsed) {
    return new CloudAuthError(createAuthFailure("malformed_response", { status: response.status }));
  }

  return new CloudAuthError(
    failureFromErrorResponse(
      response.status,
      response.body,
      parseRetryAfterSeconds(response.headers.get("retry-after")),
    ),
  );
}
