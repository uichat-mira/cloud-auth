import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthFailureAlert } from "@/components/auth-failure-alert";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { DeviceGrantsCard } from "@/components/device-grants-card";
import { FutureServices } from "@/components/future-services";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";
import type { AuthStatus } from "@/lib/auth/store";

const sessionLabels: Record<AuthStatus, string> = {
  idle: "正在检查",
  restoring: "正在检查",
  authenticated: "已登录",
  unauthenticated: "未登录",
  unavailable: "登录状态待确认",
};

export function AccountPage() {
  const {
    status,
    account,
    expiresAt,
    failure,
    notice,
    pending,
    restore,
    renew,
    logout,
    clearFailure,
  } = useAuthSession();
  const [passwordOpen, setPasswordOpen] = useState(false);
  const isAuthenticated = status === "authenticated";

  function openPasswordDialog() {
    clearFailure();
    setPasswordOpen(true);
  }

  function closePasswordDialog() {
    clearFailure();
    setPasswordOpen(false);
  }

  return (
    <div className="cloud-account">
      <header className="cloud-account-hero">
        <div>
          <p className="cloud-eyebrow">Mira Cloud / Account</p>
          <h1 aria-label="我的账户">
            {isAuthenticated ? <>你好，{account?.username ?? "朋友"}。</> : "我的账户"}
          </h1>
          <p className="cloud-account-summary">
            你的云账户、Desktop 与手机之间的授权关系，都在这里。
            <span className="block">简单查看；需要时，再管理。</span>
          </p>
        </div>
        {isAuthenticated ? (
          <div className="cloud-identity" aria-label="账户身份">
            <span className="cloud-avatar" aria-hidden="true">
              {account?.username?.trim().slice(0, 1).toUpperCase() ?? "M"}
            </span>
            <span>
              <strong>{account?.username ?? "Mira Cloud"}</strong>
              <small>Mira Cloud Account · {sessionLabels[status]}</small>
            </span>
          </div>
        ) : null}
      </header>

      <div className="cloud-page-messages">
        <AuthFailureAlert failure={passwordOpen ? null : failure} />
        {notice === "session_renewed" ? (
          <p role="status" className="text-sm text-emerald-700">
            Cloud Session 已续期，当前登录状态保持不变。
          </p>
        ) : null}
        {notice === "password_changed" ? (
          <p role="status" className="text-sm text-emerald-700">
            密码已修改，请重新登录。
          </p>
        ) : null}
      </div>

      {isAuthenticated ? (
        <>
          <div className="cloud-account-grid">
            <div className="cloud-main-column">
              <DeviceGrantsCard />
              <details className="cloud-extra-services">
                <summary>关联服务 · 尚未接入</summary>
                <div className="pt-4"><FutureServices /></div>
              </details>
            </div>

            <aside className="cloud-security" aria-labelledby="account-security-heading">
              <div className="cloud-section-title">
                <h2 id="account-security-heading">账户安全</h2>
                <p>密码与当前浏览器会话。</p>
              </div>
              <div className="cloud-action-list">
                <button type="button" aria-label="修改密码" className="cloud-action-row" onClick={openPasswordDialog}>
                  <span>
                    <strong>修改密码</strong>
                    <small>修改后，云端会话需要重新登录</small>
                  </span>
                  <span aria-hidden="true" className="cloud-arrow">›</span>
                </button>
                <details className="cloud-session-details">
                  <summary className="cloud-action-row">
                    <span>
                      <strong>当前登录会话</strong>
                      <small>仅管理此浏览器的会话</small>
                    </span>
                    <span aria-hidden="true" className="cloud-arrow">›</span>
                  </summary>
                  <div className="cloud-session-body">
                    <p>会话到期：{expiresAt ? formatExpiry(expiresAt) : "尚未读取"}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => void renew()} disabled={pending !== null}>
                        {pending === "renew" ? "续期中…" : "续期 Session"}
                      </Button>
                    </div>
                  </div>
                </details>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label="退出登录"
                  className="cloud-action-row cloud-signout"
                  onClick={() => void logout()}
                  disabled={pending !== null}
                >
                  <span>
                    <strong>{pending === "logout" ? "退出中…" : "退出登录"}</strong>
                    <small>不会退出 Desktop 本地账户</small>
                  </span>
                  <span aria-hidden="true" className="cloud-arrow">›</span>
                </Button>
              </div>
              <p className="cloud-side-note">
                云端授权修改后，Desktop 会根据有效快照和同步机制执行。
                这里不会虚构即时生效状态。
              </p>
            </aside>
          </div>
          <details className="cloud-account-technical">
            <summary>账户及会话详情</summary>
            <dl>
              <dt>Account ID</dt><dd className="break-all">{account?.id ?? "—"}</dd>
              <dt>会话状态</dt><dd>{sessionLabels[status]}</dd>
              <dt>到期时间</dt><dd>{expiresAt ? formatExpiry(expiresAt) : "—"}</dd>
            </dl>
          </details>
          <ChangePasswordDialog open={passwordOpen} onClose={closePasswordDialog} />
        </>
      ) : (
        <section aria-label="会话操作" className="cloud-account-recovery">
          {status === "idle" || status === "restoring" ? (
            <p role="status" className="text-sm text-muted-foreground">正在检查登录状态…</p>
          ) : null}
          {status === "unavailable" ? (
            <Button type="button" onClick={() => void restore()} disabled={pending !== null}>
              {pending === "restore" ? "正在检查…" : "重新检查登录状态"}
            </Button>
          ) : null}
          {status === "unauthenticated" ? (
            <Button asChild><Link to="/login">前往登录</Link></Button>
          ) : null}
        </section>
      )}
    </div>
  );
}

function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}
