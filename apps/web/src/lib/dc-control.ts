import { z } from "zod";

/**
 * DC runs on the host, outside the Cloud Auth container.
 * Caddy forwards only /dc/api/* to its loopback listener; the browser
 * supplies the existing Cloud Session and never receives host credentials.
 */
export const dcDurations = [15, 30, 60, 120, 240] as const;
export const dcMemoryLimits = [256, 384, 512] as const;
export const dcCpuLimits = [25, 50, 100] as const;
export const dcMinimumAvailable = [384, 512, 640] as const;

const policySchema = z
  .object({
    durationMinutes: z.union([
      z.literal(15),
      z.literal(30),
      z.literal(60),
      z.literal(120),
      z.literal(240),
    ]),
    memoryMiB: z.union([z.literal(256), z.literal(384), z.literal(512)]),
    cpuPercent: z.union([z.literal(25), z.literal(50), z.literal(100)]),
    minAvailableMiB: z.union([z.literal(384), z.literal(512), z.literal(640)]),
  })
  .strict();

const statusSchema = z.object({
  running: z.boolean(),
  legacyRunning: z.boolean(),
  remainingSeconds: z.number().finite().nonnegative().nullable(),
  memoryBytes: z.number().finite().nonnegative().nullable(),
  policy: policySchema,
  at: z.string(),
});

export type DcPolicy = z.infer<typeof policySchema>;
export type DcNode = "aliyun" | "tencent";
export type DcStatus = z.infer<typeof statusSchema>;

export class DcControlError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "DcControlError";
  }
}

export interface DcControlClient {
  status(sessionToken: string, signal?: AbortSignal, node?: DcNode): Promise<DcStatus>;
  savePolicy(sessionToken: string, policy: DcPolicy, node?: DcNode): Promise<DcStatus>;
  start(sessionToken: string, node?: DcNode): Promise<DcStatus>;
  stop(sessionToken: string, node?: DcNode): Promise<DcStatus>;
}

export function createDcControlClient(fetchImpl: typeof fetch = globalThis.fetch): DcControlClient {
  async function request(
    sessionToken: string,
    path: "/status" | "/policy" | "/start" | "/stop",
    method: "GET" | "PUT" | "POST" = "GET",
    payload?: DcPolicy | Record<string, never>,
    signal?: AbortSignal,
    node: DcNode = "aliyun",
  ): Promise<DcStatus> {
    if (!sessionToken) throw new DcControlError("请先登录 Mira Cloud Account", 401);

    let response: Response;
    try {
      const endpoint = node === "aliyun" ? "/dc/api" : "/dc/api/nodes/tencent";
      response = await fetchImpl(endpoint + path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        mode: "same-origin",
        ...(signal ? { signal } : {}),
        headers: {
          Authorization: "Bearer " + sessionToken,
          ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
        },
        ...(method === "GET" ? {} : { body: JSON.stringify(payload ?? {}) }),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new DcControlError("无法连接 DC 控制服务，请稍后刷新。");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new DcControlError("DC 控制服务返回了无效响应。", response.status);
    }

    if (!response.ok) {
      const serverMessage =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "string"
          ? body.error
          : null;
      const message =
        response.status === 401
          ? "云账号会话已失效，请重新登录。"
          : response.status === 403
            ? "当前云账号没有这台服务器的管理权限。"
            : (serverMessage ?? "DC 控制请求失败（HTTP " + response.status + "）");
      throw new DcControlError(message, response.status);
    }

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      throw new DcControlError("DC 控制服务返回的状态格式不符合约定。", response.status);
    }
    return parsed.data;
  }

  return {
    status: (token, signal, node) => request(token, "/status", "GET", undefined, signal, node),
    savePolicy: (token, value, node) => {
      const parsed = policySchema.safeParse(value);
      if (!parsed.success) throw new DcControlError("请选择允许的运行策略。", 400);
      return request(token, "/policy", "PUT", parsed.data, undefined, node);
    },
    start: (token, node) => request(token, "/start", "POST", {}, undefined, node),
    stop: (token, node) => request(token, "/stop", "POST", {}, undefined, node),
  };
}

export function sameDcPolicy(a: DcPolicy, b: DcPolicy): boolean {
  return (
    a.durationMinutes === b.durationMinutes &&
    a.memoryMiB === b.memoryMiB &&
    a.cpuPercent === b.cpuPercent &&
    a.minAvailableMiB === b.minAvailableMiB
  );
}
