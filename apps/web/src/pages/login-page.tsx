import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { AuthFailureAlert } from "@/components/auth-failure-alert";
import { Button } from "@/components/ui/button";
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
    <div className="cloud-auth-grid">
      <header className="cloud-auth-intro">
        <p className="cloud-eyebrow">Mira Cloud / Sign in</p>
        <h1>欢迎回来。</h1>
        <p>
          一个 Mira Cloud 账户，管理你的云身份与已授权设备。
          本地 Mira 依然可以独立使用。
        </p>
      </header>
      <section className="cloud-auth-form-col" aria-labelledby="login-title">
        <h2 id="login-title">登录 Mira Cloud</h2>
        <p className="cloud-intro-caption">登录后继续管理你的设备和访问权限。</p>
        <form className="cloud-auth-form" onSubmit={handleSubmit}>
          <div className="cloud-field">
            <label htmlFor="username">账号</label>
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
          <div className="cloud-field">
            <label htmlFor="password">密码</label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="输入密码"
              required
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (failure) clearFailure();
              }}
            />
          </div>
          {status === "restoring" ? (
            <p role="status" className="text-sm text-muted-foreground">
              正在恢复登录状态…
            </p>
          ) : null}
          <AuthFailureAlert failure={failure} />
          <Button
            type="submit"
            className="cloud-primary w-full"
            disabled={pending !== null || status === "restoring"}
          >
            {pending === "login" ? "登录中…" : "登录"}
          </Button>
        </form>
        <p className="cloud-footnote">
          Mira Cloud 仅用于 Mira 运营的云端服务；密码不会交给其他应用。
          本地、直连与 Tailscale 功能无需登录。
        </p>
      </section>
    </div>
  );
}
