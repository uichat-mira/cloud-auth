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

type AccountSection = "devices" | "security";

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
  const [section, setSection] = useState<AccountSection>("devices");
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
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Mira Cloud Account
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">我的账户</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          管理云端身份与设备访问权限。
        </p>
      </header>

      <AuthFailureAlert failure={passwordOpen ? null : failure} />

      {notice === "session_renewed" ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          Cloud Session 已续期，当前登录状态保持不变。
        </p>
      ) : null}

      {notice === "password_changed" ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">
          密码已修改，请重新登录。
        </p>
      ) : null}

      <section aria-label="账户身份" className="space-y-4 border-b pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="break-all text-lg font-medium">
              {account?.username ?? "尚未登录"}
            </p>
            <p className="text-sm text-muted-foreground">
              Mira Cloud · {sessionLabels[status]}
            </p>
          </div>
          <span className="rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            {sessionLabels[status]}
          </span>
        </div>
        <details className="text-sm">
          <summary className="w-fit cursor-pointer rounded-md text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            账户及会话详情
          </summary>
          <dl className="mt-4 grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-x-3 gap-y-3 border-t pt-4 text-sm">
            <dt className="text-muted-foreground">Account ID</dt>
            <dd className="min-w-0 break-all font-mono text-xs sm:text-sm">
              {account?.id ?? "—"}
            </dd>
            <dt className="text-muted-foreground">会话状态</dt>
            <dd>{sessionLabels[status]}</dd>
            <dt className="text-muted-foreground">到期时间</dt>
            <dd>{expiresAt ? formatExpiry(expiresAt) : "—"}</dd>
          </dl>
        </details>
      </section>

      {isAuthenticated ? (
        <>
          <div role="group" aria-label="账户管理" className="flex gap-6 border-b">
            <button
              type="button"
              aria-pressed={section === "devices"}
              onClick={() => setSection("devices")}
              className={sectionClassName(section === "devices")}
            >
              设备授权
            </button>
            <button
              type="button"
              aria-pressed={section === "security"}
              onClick={() => setSection("security")}
              className={sectionClassName(section === "security")}
            >
              账户安全
            </button>
          </div>

          {section === "devices" ? (
            <DeviceGrantsCard />
          ) : (
            <section aria-labelledby="account-security-heading" className="space-y-5">
              <div className="space-y-1">
                <h2 id="account-security-heading" className="text-lg font-semibold">
                  账户安全
                </h2>
                <p className="text-sm text-muted-foreground">
                  管理密码与当前浏览器的 Cloud Session。
                </p>
              </div>

              <button
                type="button"
                aria-label="修改密码"
                onClick={openPasswordDialog}
                className="flex w-full items-center justify-between gap-3 rounded-md border-b px-1 py-4 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="space-y-1">
                  <span className="block font-medium">修改密码</span>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    修改成功后，所有 Cloud Session 将失效，需要重新登录。
                  </span>
                </span>
                <span aria-hidden="true" className="text-lg text-muted-foreground">›</span>
              </button>

              <div className="space-y-3 border-t pt-5">
                <h3 className="text-sm font-medium">当前登录会话</h3>
                <p className="text-sm text-muted-foreground">
                  {expiresAt ? "有效期至 " + formatExpiry(expiresAt) : "会话有效期尚未读取"}
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void renew()}
                    disabled={pending !== null}
                  >
                    {pending === "renew" ? "续期中…" : "续期 Session"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => void logout()}
                    disabled={pending !== null}
                  >
                    {pending === "logout" ? "退出中…" : "退出登录"}
                  </Button>
                </div>
              </div>
            </section>
          )}
          <ChangePasswordDialog open={passwordOpen} onClose={closePasswordDialog} />
        </>
      ) : (
        <section className="space-y-4" aria-label="会话操作">
          {status === "idle" || status === "restoring" ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在检查登录状态…
            </p>
          ) : null}
          {status === "unavailable" ? (
            <Button
              type="button"
              onClick={() => void restore()}
              disabled={pending !== null}
            >
              {pending === "restore" ? "正在检查…" : "重新检查登录状态"}
            </Button>
          ) : null}
          {status === "unauthenticated" ? (
            <Button asChild>
              <Link to="/login">前往登录</Link>
            </Button>
          ) : null}
        </section>
      )}

      <details className="border-t pt-5">
        <summary className="w-fit cursor-pointer rounded-md text-sm text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
          关联服务 · 尚未接入
        </summary>
        <div className="pt-5">
          <FutureServices />
        </div>
      </details>

      <p className="text-xs leading-5 text-muted-foreground">
        Mira Cloud 只用于 Mira 运营的云端服务；本地、直连与 Tailscale 功能不需要登录。
      </p>
    </div>
  );
}

function sectionClassName(active: boolean): string {
  return [
    "border-b-2 px-1 py-3 text-sm outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50",
    active
      ? "border-foreground font-medium text-foreground"
      : "border-transparent text-muted-foreground hover:text-foreground",
  ].join(" ");
}

function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}
