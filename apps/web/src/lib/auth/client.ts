import {
  cloudSessionSchema,
  issuedCloudSessionSchema,
  type CloudSession,
  type IssuedCloudSession,
  type LoginRequest,
} from "@uichat-mira/cloud-auth-contracts";
import type { z } from "zod";
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
  logout(sessionToken: string): Promise<void>;
}

export interface CreateCloudAuthClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function createCloudAuthClient(
  options: CreateCloudAuthClientOptions = {},
): CloudAuthClient {
  const baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetchImpl(`${baseUrl}${path}`, init);
    } catch {
      throw new CloudAuthError(createAuthFailure("network_unavailable"));
    }
  }

  async function login(request: LoginRequest): Promise<IssuedCloudSession> {
    const response = await send("/v1/auth/login", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (response.status !== 200) throw await failureFor(response);
    return parseBody(response, issuedCloudSessionSchema);
  }

  async function getSession(sessionToken: string): Promise<CloudSession> {
    const response = await send("/v1/auth/session", {
      method: "GET",
      headers: bearerHeaders(sessionToken),
    });

    if (response.status !== 200) throw await failureFor(response);
    return parseBody(response, cloudSessionSchema);
  }

  async function renewSession(sessionToken: string): Promise<IssuedCloudSession> {
    const response = await send("/v1/auth/session/renew", {
      method: "POST",
      headers: bearerHeaders(sessionToken),
    });

    if (response.status !== 200) throw await failureFor(response);
    return parseBody(response, issuedCloudSessionSchema);
  }

  async function logout(sessionToken: string): Promise<void> {
    const response = await send("/v1/auth/logout", {
      method: "POST",
      headers: bearerHeaders(sessionToken),
    });

    if (response.status !== 204) throw await failureFor(response);
  }

  return { login, getSession, renewSession, logout };
}

function bearerHeaders(sessionToken: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${sessionToken}`,
  };
}

async function failureFor(response: Response): Promise<CloudAuthError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new CloudAuthError(
      createAuthFailure("malformed_response", { status: response.status }),
    );
  }

  return new CloudAuthError(
    failureFromErrorResponse(
      response.status,
      body,
      parseRetryAfterSeconds(response.headers.get("retry-after")),
    ),
  );
}

async function parseBody<T>(
  response: Response,
  schema: z.ZodType<T>,
): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CloudAuthError(
      createAuthFailure("malformed_response", { status: response.status }),
    );
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new CloudAuthError(
      createAuthFailure("malformed_response", { status: response.status }),
    );
  }
  return parsed.data;
}
