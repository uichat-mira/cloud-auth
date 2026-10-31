import { Link, useLocation } from "react-router-dom";
import { loginUrlForAccount } from "@/lib/auth/return-location";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";
import { sessionLabels } from "@/lib/auth/session-labels";

/**
 * Signed-out console states. AccountLayout renders this instead of the route
 * outlet, so no page component — and therefore no grant fetch — ever mounts for
 * a visitor without a confirmed session.
 *
 * Copy is part of the test contract: 前往登录 / 重新检查登录状态 / 未登录 /
 * 暂时无法确认此浏览器的登录状态，请重新检查。
 */
export function SessionRecovery() {
  const { status, pending, restore, failure } = useAuthSession();
  const { pathname, search, hash } = useLocation();
  const loginHref = loginUrlForAccount(pathname + search + hash);

  if (status === "idle" || status === "restoring") {
    return (
      <section aria-label="会话操作" className="console-recovery">
        <div className="console-recovery-card">
          <p role="status" className="console-recovery-status">
            正在检查登录状态…
          </p>
          <div aria-hidden="true" className="console-skeleton-lines">
            <span className="console-skeleton-line" />
            <span className="console-skeleton-line console-skeleton-line-short" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="会话操作" className="console-recovery">
      <div className="console-recovery-card">
        <span aria-hidden="true" className="console-recovery-icon">
          <SessionGlyph />
        </span>
        <p className="console-recovery-title">{sessionLabels[status]}</p>

        {status === "unavailable" ? (
          <>
            <p className="console-recovery-copy">暂时无法确认此浏览器的登录状态，请重新检查。</p>
            <div className="console-recovery-actions">
              <Button type="button" onClick={() => void restore()} disabled={pending !== null}>
                {pending === "restore" ? "正在检查…" : "重新检查登录状态"}
              </Button>
            </div>
          </>
        ) : null}

        {status === "unauthenticated" ? (
          <>
            <p className="console-recovery-copy">
              {failure?.kind === "reauth_required"
                ? "登录已过期。重新登录后将返回刚才的页面，不会自动重试任何控制操作。"
                : "登录 Mira Cloud 账户后，即可在此管理已授权设备与访问权限。"}
            </p>
            <div className="console-recovery-actions">
              <Button asChild>
                <Link to={loginHref}>前往登录</Link>
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function SessionGlyph() {
  return (
    <svg
      className="console-recovery-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 19.25c1.4-3.1 4-4.75 7-4.75s5.6 1.65 7 4.75" />
    </svg>
  );
}
