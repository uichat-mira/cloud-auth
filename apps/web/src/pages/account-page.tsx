import { Link } from "react-router-dom";
import { AuthFailureAlert } from "@/components/auth-failure-alert";
import { FutureServices } from "@/components/future-services";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  } = useAuthSession();
  const isAuthenticated = status === "authenticated";

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Mira Cloud Account
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            账户概览
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Mira 保持本地优先：本地、直连与 Tailscale 功能不需要登录；Cloud
            Account 仅用于访问 Mira 运营的云端服务。
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {sessionLabels[status]}
        </span>
      </header>

      <AuthFailureAlert failure={failure} />

      {notice === "session_renewed" ? (
        <p
          role="status"
          className="rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"
        >
          Cloud Session 已续期，当前登录状态保持不变。
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mira Cloud 身份</CardTitle>
            <CardDescription>
              {account
                ? "当前浏览器正在使用的 Mira Cloud 账号。"
                : "当前没有可展示的账号信息。"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3 text-sm">
              <dt className="text-muted-foreground">账号</dt>
              <dd className="font-medium">{account?.username ?? "—"}</dd>
              <dt className="text-muted-foreground">Account ID</dt>
              <dd className="break-all font-mono text-xs sm:text-sm">
                {account?.id ?? "—"}
              </dd>
              <dt className="text-muted-foreground">登录状态</dt>
              <dd className="font-medium">{sessionLabels[status]}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cloud Session</CardTitle>
            <CardDescription>
              {isAuthenticated
                ? "刷新页面会自动恢复此 Session；续期会轮换凭据并延长有效期。"
                : "登录后这里会显示当前 Session 状态与到期时间。"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3 text-sm">
              <dt className="text-muted-foreground">状态</dt>
              <dd className="font-medium">{sessionLabels[status]}</dd>
              <dt className="text-muted-foreground">到期时间</dt>
              <dd>{expiresAt ? formatExpiry(expiresAt) : "—"}</dd>
            </dl>

            {isAuthenticated ? (
              <div className="flex flex-wrap gap-2">
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
              <Button asChild className="w-full sm:w-auto">
                <Link to="/login">前往登录</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <FutureServices />
    </div>
  );
}

function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
}
