import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function LoginPage() {
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
          使用 Mira Cloud 账号访问跨设备账户与云端服务。登录与会话处理将在后续版本接入此页面。
        </p>
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
            当前为 Web 界面骨架，认证流程尚未接入。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4"
            aria-describedby="login-placeholder-note"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="username">
                账号
              </label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="Mira Cloud 账号"
                disabled
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
                disabled
              />
            </div>
            <Button type="submit" className="w-full" disabled>
              登录
            </Button>
          </form>
          <p
            id="login-placeholder-note"
            className="mt-4 text-xs leading-5 text-muted-foreground"
          >
            账号密码认证与 Cloud Session 将作为后续工作项接入。
          </p>
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
