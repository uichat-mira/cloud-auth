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

  async function requestJson<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const response = await send(path, init);
    if (response.status !== 200) throw await failureFor(response);
    return parseBody(response, schema);
  }

  async function requestNoContent(
    path: string,
    init: RequestInit,
  ): Promise<void> {
    const response = await send(path, init);
    if (response.status !== 204) throw await failureFor(response);
  }

  function login(request: LoginRequest): Promise<IssuedCloudSession> {
    return requestJson(
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
    return requestSession(
      "/v1/auth/session",
      "GET",
      sessionToken,
      cloudSessionSchema,
    );
  }

  function renewSession(sessionToken: string): Promise<IssuedCloudSession> {
    return requestSession(
      "/v1/auth/session/renew",
      "POST",
      sessionToken,
      issuedCloudSessionSchema,
    );
  }

  function logout(sessionToken: string): Promise<void> {
    return requestNoContent(
      "/v1/auth/logout",
      authenticatedRequest("POST", sessionToken),
    );
  }

  function requestSession<T>(
    path: string,
    method: "GET" | "POST",
    sessionToken: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    return requestJson(path, authenticatedRequest(method, sessionToken), schema);
  }

  return { login, getSession, renewSession, logout };
}

function authenticatedRequest(
  method: "GET" | "POST",
  sessionToken: string,
): RequestInit {
  return {
    method,
    headers: bearerHeaders(sessionToken),
  };
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
    body = await readJsonBody(response);
  } catch (error) {
    return error as CloudAuthError;
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
  const body = await readJsonBody(response);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new CloudAuthError(
      createAuthFailure("malformed_response", { status: response.status }),
    );
  }
  return parsed.data;
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new CloudAuthError(
      createAuthFailure("malformed_response", { status: response.status }),
    );
  }
}
