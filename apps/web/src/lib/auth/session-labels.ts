import type { AuthStatus } from "@/lib/auth/store";

/** Human-facing session state, shared by the shell, recovery states and overview. */
export const sessionLabels: Record<AuthStatus, string> = {
  idle: "正在检查",
  restoring: "正在检查",
  authenticated: "已登录",
  unauthenticated: "未登录",
  unavailable: "登录状态待确认",
};
