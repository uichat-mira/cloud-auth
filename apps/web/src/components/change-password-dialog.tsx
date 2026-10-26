import { useEffect, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { AuthFailureAlert } from "@/components/auth-failure-alert";
import { useRegisterModalOpen } from "@/components/modal-open-context";
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

  // While this dialog is open it owns the alert region: the console layout hides
  // its own copy of the shared failure so one state never renders two alerts.
  useRegisterModalOpen(open);

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
      className="cloud-dialog"
    >
      <div className="cloud-dialog-head">
        <div>
          <h2 id="change-password-heading">修改密码</h2>
          <p id="change-password-description" className="cloud-dialog-caption">
            修改成功后，所有 Cloud Session 将失效，需要重新登录。
          </p>
        </div>
        <button
          type="button"
          aria-label="关闭弹窗"
          onClick={close}
          disabled={submitting}
          className="cloud-dialog-close"
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} className="cloud-dialog-form">
        <div className="cloud-field">
          <label htmlFor="current-password">当前密码</label>
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
        <div className="cloud-field">
          <label htmlFor="new-password">新密码</label>
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
          <p className="cloud-field-hint">新密码至少 15 个字符。</p>
        </div>

        <AuthFailureAlert failure={failure} />

        <div className="cloud-dialog-footer">
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
