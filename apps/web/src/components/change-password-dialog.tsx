import { useEffect, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { AuthFailureAlert } from "@/components/auth-failure-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/context";

interface ChangePasswordDialogProps {
  open: boolean;
  onClose(): void;
}

export function ChangePasswordDialog({ open, onClose }: ChangePasswordDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { pending, failure, changePassword } = useAuthSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const submitting = pending === "changePassword";

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Native modal dialogs provide focus containment, Escape and focus return.
    // jsdom has no showModal implementation, so tests use the open attribute.
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }

    return () => {
      if (!dialog.open) return;
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    };
  }, [open]);

  function close() {
    if (submitting) return;
    setCurrentPassword("");
    setNewPassword("");
    onClose();
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (submitting) {
      event.preventDefault();
      return;
    }
    close();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending !== null || !currentPassword || newPassword.length < 15) return;
    void changePassword(currentPassword, newPassword);
  }

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="change-password-heading"
      aria-describedby="change-password-description"
      onCancel={handleCancel}
      onClose={close}
      onClick={(event) => {
        if (event.target !== event.currentTarget || submitting) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          close();
        }
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border bg-background p-0 text-foreground shadow-xl backdrop:bg-foreground/40"
    >
      <div className="flex items-start justify-between gap-4 px-6 pt-6">
        <div className="space-y-2">
          <h2 id="change-password-heading" className="text-xl font-semibold tracking-tight">
            修改密码
          </h2>
          <p id="change-password-description" className="text-sm leading-6 text-muted-foreground">
            修改成功后，所有 Cloud Session 将失效，需要重新登录。
          </p>
        </div>
        <button
          type="button"
          aria-label="关闭弹窗"
          onClick={close}
          disabled={submitting}
          className="rounded-md px-1 text-xl text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 px-6 pb-6 pt-5">
        <div className="grid gap-2">
          <label htmlFor="current-password" className="text-sm font-medium">
            当前密码
          </label>
          <Input
            id="current-password"
            name="current-password"
            type="password"
            autoComplete="current-password"
            placeholder="输入当前密码"
            required
            autoFocus
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="grid gap-2">
          <label htmlFor="new-password" className="text-sm font-medium">
            新密码
          </label>
          <Input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            placeholder="至少 15 个字符"
            required
            minLength={15}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            新密码至少 15 个字符。
          </p>
        </div>

        <AuthFailureAlert failure={failure} />

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={close} disabled={submitting}>
            取消
          </Button>
          <Button
            type="submit"
            disabled={pending !== null || !currentPassword || newPassword.length < 15}
          >
            {submitting ? "修改中…" : "确认修改"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
