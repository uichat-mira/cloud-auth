import type { AuthStatus } from "./store";

/** Keep public entry points consistent while a saved session is being checked. */
export function getAccountEntry(status: AuthStatus) {
  const checking = status === "idle" || status === "restoring";
  const destination =
    status === "authenticated" || status === "unavailable"
      ? "/account"
      : "/login";

  if (status === "authenticated") {
    return {
      checking,
      destination,
      label: "账户中心",
      homeLabel: "进入账户中心",
    };
  }

  if (status === "unavailable") {
    return {
      checking,
      destination,
      label: "检查登录状态",
      homeLabel: "检查登录状态",
    };
  }

  return { checking, destination, label: "登录", homeLabel: "登录 Mira Cloud" };
}
