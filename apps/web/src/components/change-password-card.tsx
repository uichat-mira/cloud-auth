import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/context";

export function ChangePasswordCard() {
  const { pending, changePassword } = useAuthSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const isSubmitting = pending === "changePassword";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending !== null) return;
    void changePassword(currentPassword, newPassword);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>修改密码</CardTitle>
        <CardDescription>
          修改成功后会撤销该账号的所有 Cloud
          Session，包括当前会话，需要使用新密码重新登录。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="current-password">
              当前密码
            </label>
            <Input
              id="current-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              placeholder="当前密码"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="new-password">
              新密码
            </label>
            <Input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              placeholder="至少 15 个字符"
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              新密码必须满足 Mira Cloud Account 密码策略（至少 15 个字符）。
            </p>
          </div>
          <Button
            type="submit"
            className="w-full sm:w-auto"
            disabled={pending !== null}
          >
            {isSubmitting ? "修改中…" : "修改密码"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
