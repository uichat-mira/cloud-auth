import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export interface DcStopDialogProps {
  nodeName: string;
  node: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Confirmation before stopping a DC service; the parent owns open state. */
export function DcStopDialog({ nodeName, node, busy, onCancel, onConfirm }: DcStopDialogProps) {
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

  return (
    <dialog
      ref={dialog}
      className="cloud-dialog"
      aria-labelledby={`dc-stop-title-${node}`}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onCancel();
      }}
    >
      <div className="cloud-dialog-head">
        <div>
          <h2 id={`dc-stop-title-${node}`}>停止 {nodeName} DC 服务？</h2>
          <p className="cloud-dialog-caption">正在执行的远程操作将中断。其他服务不受影响。</p>
        </div>
      </div>
      <div className="cloud-dialog-footer">
        <Button variant="outline" disabled={busy} onClick={onCancel}>
          取消
        </Button>
        <Button variant="destructive" disabled={busy} onClick={onConfirm}>
          确认停止
        </Button>
      </div>
    </dialog>
  );
}
