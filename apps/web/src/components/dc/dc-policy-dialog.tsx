import { useEffect, useRef, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import {
  dcCpuLimits,
  dcDurations,
  dcMemoryLimits,
  dcMinimumAvailable,
  type DcPolicy,
} from "@/lib/dc-control";
import { durationLabel } from "./dc-format";

export interface DcPolicyDialogProps {
  node: string;
  draft: DcPolicy | null;
  busy: boolean;
  saving: boolean;
  inactive: boolean;
  dirty: boolean;
  policyError: string;
  onUpdate: (key: keyof DcPolicy, value: number) => void;
  onClose: () => void;
  onSubmit: () => void;
}

/** Run-policy editor. Draft state lives in the parent so it survives re-polls. */
export function DcPolicyDialog({
  node,
  draft,
  busy,
  saving,
  inactive,
  dirty,
  policyError,
  onUpdate,
  onClose,
  onSubmit,
}: DcPolicyDialogProps) {
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inactive || !dirty) return;
    onSubmit();
  }

  return (
    <dialog
      ref={dialog}
      className="cloud-dialog dc-policy-dialog"
      aria-labelledby={`dc-run-policy-${node}`}
      aria-describedby={`dc-policy-caption-${node}`}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="cloud-dialog-head">
        <div>
          <h2 id={`dc-run-policy-${node}`}>运行策略</h2>
          <p id={`dc-policy-caption-${node}`} className="cloud-dialog-caption">
            配置将在下次启动 DC 时生效。
          </p>
        </div>
        <button
          type="button"
          className="cloud-dialog-close"
          aria-label="关闭运行策略"
          disabled={busy}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form className="cloud-dialog-form" onSubmit={handleSubmit}>
        <fieldset className="dc-field" disabled={inactive}>
          <legend>单次运行时长</legend>
          <div className="dc-duration-group" aria-label="运行时长">
            {dcDurations.map((minutes) => (
              <button
                type="button"
                key={minutes}
                aria-pressed={draft?.durationMinutes === minutes}
                className={
                  draft?.durationMinutes === minutes
                    ? "dc-duration dc-duration-active"
                    : "dc-duration"
                }
                onClick={() => onUpdate("durationMinutes", minutes)}
              >
                {durationLabel(minutes)}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="dc-select-grid">
          <label className="dc-field">
            内存上限
            <select
              value={draft?.memoryMiB ?? 384}
              disabled={inactive}
              onChange={(event) => onUpdate("memoryMiB", Number(event.target.value))}
            >
              {dcMemoryLimits.map((value) => (
                <option value={value} key={value}>
                  {value} MiB
                </option>
              ))}
            </select>
          </label>
          <label className="dc-field">
            CPU 限额
            <select
              value={draft?.cpuPercent ?? 50}
              disabled={inactive}
              onChange={(event) => onUpdate("cpuPercent", Number(event.target.value))}
            >
              {dcCpuLimits.map((value) => (
                <option value={value} key={value}>
                  {value}% 单核
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="dc-field dc-field-full">
          启动前最少可用内存
          <select
            value={draft?.minAvailableMiB ?? 512}
            disabled={inactive}
            onChange={(event) => onUpdate("minAvailableMiB", Number(event.target.value))}
          >
            {dcMinimumAvailable.map((value) => (
              <option value={value} key={value}>
                {value} MiB
              </option>
            ))}
          </select>
        </label>
        <div className="dc-policy-fact">
          <span>到期自动停止</span>
          <strong>始终开启</strong>
        </div>
        <div className="dc-policy-fact">
          <span>开机自动启动</span>
          <span>未启用</span>
        </div>
        {policyError ? <Notice tone="danger">{policyError}</Notice> : null}
        <div className="cloud-dialog-footer">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={inactive || !dirty}>
            {saving ? "保存中…" : "确认保存"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
