import {
  authErrorEnvelopeSchema,
  type PublicAuthErrorCode,
} from "@uichat-mira/cloud-auth-contracts";

export type AuthFailureKind =
  | "invalid_credentials"
  | "invalid_password"
  | "reauth_required"
  | "rate_limited"
  | "service_unavailable"
  | "network_unavailable"
  | "malformed_response"
  | "unexpected_response";

export interface AuthFailure {
  readonly kind: AuthFailureKind;
  readonly message: string;
  readonly code: PublicAuthErrorCode | null;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;
}

const failureMessages: Record<AuthFailureKind, string> = {
  invalid_credentials: "账号或密码不正确。",
  invalid_password: "新密码不符合密码策略，请使用至少 15 个字符的新密码。",
  reauth_required: "登录状态已失效或已过期，请重新登录。",
  rate_limited: "尝试次数过多，请稍后再试。",
  service_unavailable: "认证服务暂时不可用，请稍后重试。",
  network_unavailable: "无法连接认证服务，请检查网络后重试。",
  malformed_response: "认证服务返回了无法识别的响应。",
  unexpected_response: "认证服务出现异常，请稍后重试。",
};

export function createAuthFailure(
  kind: AuthFailureKind,
  details: {
    code?: PublicAuthErrorCode | null;
    status?: number | null;
    retryAfterSeconds?: number | null;
  } = {},
): AuthFailure {
  return {
    kind,
    message: failureMessages[kind],
    code: details.code ?? null,
    status: details.status ?? null,
    retryAfterSeconds: details.retryAfterSeconds ?? null,
  };
}

export class CloudAuthError extends Error {
  readonly failure: AuthFailure;

  constructor(failure: AuthFailure) {
    super(failure.message);
    this.name = "CloudAuthError";
    this.failure = failure;
  }
}

export function toAuthFailure(error: unknown): AuthFailure {
  if (error instanceof CloudAuthError) return error.failure;
  return createAuthFailure("unexpected_response");
}

export function parseRetryAfterSeconds(value: string | null): number | null {
  if (value === null) return null;
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 0) return null;
  return seconds;
}

export function failureFromErrorResponse(
  status: number,
  body: unknown,
  retryAfterSeconds: number | null,
): AuthFailure {
  const envelope = authErrorEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return createAuthFailure("malformed_response", { status });
  }

  const code = envelope.data.error.code;
  return createAuthFailure(kindForErrorResponse(status, code), {
    code,
    status,
    retryAfterSeconds,
  });
}

function kindForErrorResponse(
  status: number,
  code: PublicAuthErrorCode,
): AuthFailureKind {
  if (status === 429 || code === "AUTH_RATE_LIMITED") return "rate_limited";
  if (status === 503 || code === "AUTH_BUSY") return "service_unavailable";
  if (code === "AUTH_REAUTH_REQUIRED") return "reauth_required";
  if (code === "AUTH_INVALID_CREDENTIALS") return "invalid_credentials";
  if (code === "AUTH_INVALID_PASSWORD") return "invalid_password";
  return "unexpected_response";
}
