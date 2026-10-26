import { useNavigate } from "react-router-dom";
import { ConsoleRailItem } from "@/components/console-rail-item";
import { useAuthSession } from "@/lib/auth/context";

/**
 * The only 退出登录 control in the app. Rendered once, inside the rail; below
 * 1024px the rail becomes a horizontal strip and this block becomes its last line.
 */
export function SessionBlock() {
  const { pending, logout, getSessionToken } = useAuthSession();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    if (!getSessionToken()) {
      void navigate("/login", { replace: true });
    }
  }

  return (
    <div className="console-session">
      <ConsoleRailItem
        type="button"
        className="console-session-logout"
        onClick={() => void handleLogout()}
        disabled={pending !== null}
      >
        {pending === "logout" ? "退出中…" : "退出登录"}
      </ConsoleRailItem>
    </div>
  );
}
