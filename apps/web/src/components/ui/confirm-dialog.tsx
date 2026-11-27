import { useEffect, useRef, type ReactNode, type SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  busy?: boolean;
  tone?: "default" | "destructive";
  onConfirm(): void;
  onCancel(): void;
}

/**
 * Page-owned confirmation. Uses the native `<dialog>` element for focus
 * containment and Escape, instead of `window.confirm`. Render it only while
 * the confirmation is open.
 */
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = "取消",
  busy = false,
  tone = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
    return () => {
      if (typeof element.close === "function" && element.open) element.close();
      else element.removeAttribute("open");
    };
  }, []);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    if (!busy) onCancel();
  }

  return (
    <dialog
      ref={dialog}
      className="cloud-dialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
      onCancel={handleCancel}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          onCancel();
        }
      }}
    >
      <div className="cloud-dialog-head">
        <div>
          <h2 id="confirm-dialog-title">{title}</h2>
          <p id="confirm-dialog-description" className="cloud-dialog-caption">
            {description}
          </p>
        </div>
      </div>
      <div className="cloud-dialog-footer">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={tone === "destructive" ? "destructive" : "default"}
          disabled={busy}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

export { ConfirmDialog };
