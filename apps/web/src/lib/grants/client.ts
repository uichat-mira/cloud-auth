import {
  deviceListResponseSchema,
  hostGrantManagementListResponseSchema,
  hostMobileGrantMutationResponseSchema,
  updateHostMobileGrantRequestSchema,
  type HostGrantManagementEntry,
  type HostMobileGrantMutationResponse,
  type MiraDevice,
  type RemoteDeviceScope,
} from "@uichat-mira/cloud-auth-contracts";
import { z } from "zod";
import {
  authenticatedRequest,
  bearerHeaders,
  createHttpTransport,
  type FailedResponse,
} from "@/lib/http/transport";

export type HostGrantsFailureKind =
  | "reauth_required"
  | "forbidden"
  | "not_found"
  | "stale_revision"
  | "conflict"
  | "invalid_request"
  | "rate_limited"
  | "service_unavailable"
  | "network_unavailable"
  | "malformed_response"
  | "unexpected_response";

export interface HostGrantsFailure {
  readonly kind: HostGrantsFailureKind;
  readonly message: string;
  readonly status: number | null;
  readonly code: string | null;
}

const failureMessages: Record<HostGrantsFailureKind, string> = {
  reauth_required: "Cloud Session 已失效，请重新登录后管理设备授权。",
  forbidden: "云端拒绝此操作：Portal 只能收窄或撤销已有授权，不能扩大权限。",
  not_found: "Desktop Host 或手机设备已不存在或已撤销。",
  stale_revision: "云端授权已被其他操作更新，请确认最新状态后再次操作。",
  conflict: "云端授权状态发生冲突，请刷新后重试。",
  invalid_request: "授权请求无效，请刷新后重试。",
  rate_limited: "请求过于频繁，请稍后再试。",
  service_unavailable: "云端授权服务暂时不可用，请稍后重试；未在本地修改任何授权。",
  network_unavailable: "无法连接云端授权服务，请检查网络；未在本地修改任何授权。",
  malformed_response: "云端授权服务返回了无法识别的响应。",
  unexpected_response: "云端授权服务出现异常，请稍后重试；未在本地修改任何授权。",
};

export function createHostGrantsFailure(
  kind: HostGrantsFailureKind,
  details: { status?: number | null; code?: string | null } = {},
): HostGrantsFailure {
  return {
    kind,
    message: failureMessages[kind],
    status: details.status ?? null,
    code: details.code ?? null,
  };
}

export class HostGrantsError extends Error {
  readonly failure: HostGrantsFailure;

  constructor(failure: HostGrantsFailure) {
    super(failure.message);
    this.name = "HostGrantsError";
    this.failure = failure;
  }
}

export function toHostGrantsFailure(error: unknown): HostGrantsFailure {
  if (error instanceof HostGrantsError) return error.failure;
  return createHostGrantsFailure("unexpected_response");
}

export interface NarrowHostMobileGrantRequest {
  expectedRevision: number;
  scopes: RemoteDeviceScope[];
}

/**
 * What the Portal may ask the Cloud Auth grants API.
 *
 * Deliberately narrow: the Portal reads the account-owned grant ledger and
 * mutates it. The Host inventory and Host-side snapshot endpoints stay with the
 * clients that actually consume them, so this interface cannot grow a second,
 * never-called read path.
 */
export interface HostGrantsClient {
  listManagement(sessionToken: string): Promise<HostGrantManagementEntry[]>;
  listDevices(sessionToken: string): Promise<MiraDevice[]>;
  narrowGrant(
    sessionToken: string,
    hostId: string,
    mobileDeviceId: string,
    request: NarrowHostMobileGrantRequest,
  ): Promise<HostMobileGrantMutationResponse>;
  revokeGrant(
    sessionToken: string,
    hostId: string,
    mobileDeviceId: string,
    expectedRevision: number,
  ): Promise<HostMobileGrantMutationResponse>;
}

export interface CreateHostGrantsClientOptions {
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export function createHostGrantsClient(
  options: CreateHostGrantsClientOptions = {},
): HostGrantsClient {
  const transport = createHttpTransport({
    ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    hooks: {
      networkUnavailable: () => new HostGrantsError(createHostGrantsFailure("network_unavailable")),
      malformedResponse: (status) =>
        new HostGrantsError(createHostGrantsFailure("malformed_response", { status })),
      responseFailed: failedResponseToError,
    },
  });

  function listManagement(sessionToken: string): Promise<HostGrantManagementEntry[]> {
    return transport
      .json(
        "/v1/hosts/grant-management",
        authenticatedRequest("GET", sessionToken),
        hostGrantManagementListResponseSchema,
      )
      .then((response) => response.hosts);
  }

  function listDevices(sessionToken: string): Promise<MiraDevice[]> {
    return transport
      .json("/v1/devices", authenticatedRequest("GET", sessionToken), deviceListResponseSchema)
      .then((response) => response.devices);
  }

  async function narrowGrant(
    sessionToken: string,
    hostId: string,
    mobileDeviceId: string,
    request: NarrowHostMobileGrantRequest,
  ): Promise<HostMobileGrantMutationResponse> {
    const parsed = updateHostMobileGrantRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new HostGrantsError(createHostGrantsFailure("invalid_request"));
    }

    const result = await transport.json(
      grantPath(hostId, mobileDeviceId),
      {
        method: "PATCH",
        headers: {
          ...bearerHeaders(sessionToken),
          "content-type": "application/json",
        },
        body: JSON.stringify(parsed.data),
      },
      hostMobileGrantMutationResponseSchema,
    );
    assertMutationTarget(result, hostId, mobileDeviceId);
    return result;
  }

  async function revokeGrant(
    sessionToken: string,
    hostId: string,
    mobileDeviceId: string,
    expectedRevision: number,
  ): Promise<HostMobileGrantMutationResponse> {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new HostGrantsError(createHostGrantsFailure("invalid_request"));
    }

    const result = await transport.json(
      `${grantPath(hostId, mobileDeviceId)}?expectedRevision=${expectedRevision}`,
      authenticatedRequest("DELETE", sessionToken),
      hostMobileGrantMutationResponseSchema,
    );
    assertMutationTarget(result, hostId, mobileDeviceId);
    return result;
  }

  return { listManagement, listDevices, narrowGrant, revokeGrant };
}

function grantPath(hostId: string, mobileDeviceId: string): string {
  return `/v1/hosts/${encodeURIComponent(hostId)}/grants/${encodeURIComponent(mobileDeviceId)}`;
}

function assertMutationTarget(
  result: HostMobileGrantMutationResponse,
  hostId: string,
  mobileDeviceId: string,
): void {
  if (result.hostId !== hostId || result.mobileDeviceId !== mobileDeviceId) {
    throw new HostGrantsError(createHostGrantsFailure("unexpected_response", { status: 200 }));
  }
}

/**
 * Grants failures carry a canonical `{ error: { code } }` envelope when the
 * service produced them. A proxy or a total outage may answer with HTML
 * instead; the status alone then still classifies the failure.
 */
function failedResponseToError(response: FailedResponse): HostGrantsError {
  let code: string | null = null;
  if (response.bodyParsed) {
    const parsed = errorEnvelopeSchema.safeParse(response.body);
    if (parsed.success) code = parsed.data.error.code;
  }

  return new HostGrantsError(
    createHostGrantsFailure(kindForResponse(response.status, code), {
      status: response.status,
      code,
    }),
  );
}

function kindForResponse(status: number, code: string | null): HostGrantsFailureKind {
  if (status === 401) return "reauth_required";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) {
    return code === "HOST_GRANT_STALE_REVISION" ? "stale_revision" : "conflict";
  }
  if (status === 400) return "invalid_request";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "service_unavailable";
  return "unexpected_response";
}
