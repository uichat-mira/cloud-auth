import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { returnToFromLoginSearch } from "@/lib/auth/return-location";
import { AuthFailureAlert } from "@/components/auth-failure-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/context";

export function LoginPage() {
  const { status, failure, pending, login, clearFailure } = useAuthSession();
  const location = useLocation();
  const destination = returnToFromLoginSearch(location.search);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (status === "authenticated") {
    return <Navigate to={destination} replace />;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void login(username, password);
  }

  return (
    <div className="cloud-auth-canvas">
      <section className="cloud-auth-card" aria-labelledby="login-title">
        <div className="cloud-auth-card-head">
          <h1 id="login-title">登录 Mira Cloud</h1>
          <p className="cloud-auth-caption">
            登录后继续管理你的设备和访问权限。
          </p>
        </div>

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
            <p role="status" className="cloud-auth-status">
              正在恢复登录状态…
            </p>
          ) : null}
          <AuthFailureAlert failure={failure} />
          <Button
            type="submit"
            size="xl"
            className="cloud-auth-submit"
            disabled={pending !== null || status === "restoring"}
          >
            {pending === "login" ? "登录中…" : "登录"}
          </Button>
        </form>

        <p className="cloud-auth-card-note">
          登录状态仅保存在此浏览器，可随时退出登录。
        </p>
      </section>
    </div>
  );
}
