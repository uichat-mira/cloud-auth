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
    <div className="mx-auto w-full max-w-sm py-6 sm:py-14">
      <header className="space-y-2 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Mira Cloud Account
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          登录 Mira Cloud
        </h1>
      </header>

      <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
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
        {status === "restoring" ? (
          <p role="status" className="text-sm text-muted-foreground">
            正在恢复登录状态…
          </p>
        ) : null}
        <AuthFailureAlert failure={failure} />
        <Button
          type="submit"
          className="w-full"
          disabled={pending !== null || status === "restoring"}
        >
          {pending === "login" ? "登录中…" : "登录"}
        </Button>
      </form>

      <p className="mt-8 text-center text-xs leading-5 text-muted-foreground">
        Mira Cloud 仅用于 Mira 运营的云端服务；本地、直连与 Tailscale
        功能无需登录。
      </p>
    </div>
  );
}
