import { Link } from "react-router-dom";
import {
  useSessionPlaceholder,
  type PlaceholderSession,
} from "@/app/session-placeholder";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const sessionLabels: Record<PlaceholderSession["status"], string> = {
  unauthenticated: "未登录",
};

export function AccountPage() {
  const session = useSessionPlaceholder();

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Mira Cloud Account
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            账户概览
          </h1>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            这里将展示 Mira Cloud 账号、Cloud Session 与关联服务状态。
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          {sessionLabels[session.status]}
        </span>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>账号</CardTitle>
            <CardDescription>
              当前没有可展示的账号信息。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3 text-sm">
              <dt className="text-muted-foreground">账号</dt>
              <dd className="font-medium">—</dd>
              <dt className="text-muted-foreground">Account ID</dt>
              <dd className="font-mono text-xs sm:text-sm">—</dd>
              <dt className="text-muted-foreground">登录状态</dt>
              <dd className="font-medium">{sessionLabels[session.status]}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cloud Session</CardTitle>
            <CardDescription>
              登录后这里会显示当前 Session 状态。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3 text-sm">
              <dt className="text-muted-foreground">状态</dt>
              <dd className="font-medium">暂无活动 Session</dd>
              <dt className="text-muted-foreground">到期时间</dt>
              <dd>—</dd>
            </dl>
            <Button asChild className="w-full sm:w-auto">
              <Link to="/login">前往登录</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
