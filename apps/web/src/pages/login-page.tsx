import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthFailureAlert } from "@/components/auth-failure-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/context";

export function LoginPage() {
  const { status, failure, pending, login, clearFailure } = useAuthSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (status === "authenticated") {
    return <Navigate to="/account" replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void login(username, password);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-center">
      <section className="space-y-4">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Mira Cloud Account
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          登录 Mira Cloud
        </h1>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          使用 Mira Cloud 账号访问跨设备账户与云端服务。登录后会建立可恢复、可续期的 Cloud Session。
        </p>
        <ul className="grid max-w-xl gap-2 text-sm leading-6 text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">本地优先：</span>
            本地、直连与 Tailscale 功能不需要 Mira Cloud 登录。
          </li>
          <li>
            <span className="font-medium text-foreground">云端身份：</span>
            Mira Cloud Account 只用于 Mira 运营的云端服务与会话。
          </li>
          <li>
            <span className="font-medium text-foreground">尚未接入：</span>
            Mira Device、Cloud Shiyan、Hosted Relay 仍在建设中。
          </li>
        </ul>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="rounded-full border px-3 py-1">Cloud Account</span>
          <span className="rounded-full border px-3 py-1">Cloud Session</span>
          <span className="rounded-full border px-3 py-1">服务凭据</span>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>账号登录</CardTitle>
          <CardDescription>
            使用 Mira Cloud 账号与密码登录当前浏览器。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="username">
                账号
              </label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="Mira Cloud 账号"
                required
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  if (failure) clearFailure();
                }}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="password">
                密码
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="密码"
                required
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (failure) clearFailure();
                }}
              />
            </div>
            <AuthFailureAlert failure={failure} />
            <Button
              type="submit"
              className="w-full"
              disabled={pending !== null || status === "restoring"}
            >
              {pending === "login" ? "登录中…" : "登录"}
            </Button>
          </form>
          <p className="mt-6 text-xs text-muted-foreground">
            只是想查看账户页面？
            <Button asChild variant="link" className="h-auto px-1 py-0 text-xs">
              <Link to="/account">前往账户概览</Link>
            </Button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
