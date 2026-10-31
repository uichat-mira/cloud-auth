import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";
import { revokeFailedSession } from "@/lib/auth/reauth";
import {
  createDcControlClient,
  DcControlError,
  dcCpuLimits,
  dcDurations,
  dcMemoryLimits,
  dcMinimumAvailable,
  sameDcPolicy,
  type DcPolicy,
  type DcStatus,
} from "@/lib/dc-control";

type Action = "start" | "stop" | "save";

function durationLabel(minutes: number): string {
  return minutes < 60 ? minutes + " 分钟" : minutes / 60 + " 小时";
}

function remainingLabel(seconds: number | null): string {
  if (seconds === null) return "—";
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = String(value % 60).padStart(2, "0");
  return hours > 0
    ? hours + " 小时 " + minutes + " 分 " + secs + " 秒"
    : minutes + " 分 " + secs + " 秒";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "DC 控制服务暂不可用。";
}

/** An account-owned view; the privileged HTTP service remains on the host. */
export function DcControlPage() {
  const { getSessionToken, invalidateSession } = useAuthSession();
  const client = useMemo(() => createDcControlClient(), []);
  const [snapshot, setSnapshot] = useState<DcStatus | null>(null);
  const [draft, setDraft] = useState<DcPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stopOpen, setStopOpen] = useState(false);
  const [lastRead, setLastRead] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const lastPolicy = useRef<DcPolicy | null>(null);
  const busyRef = useRef(false);
  const stopDialog = useRef<HTMLDialogElement>(null);

  const applySnapshot = useCallback((data: DcStatus) => {
    setDraft((previous) =>
      previous && lastPolicy.current && !sameDcPolicy(previous, lastPolicy.current)
        ? previous
        : { ...data.policy },
    );
    lastPolicy.current = data.policy;
    setSnapshot(data);
    setLastRead(Date.now());
    setClock(Date.now());
  }, []);

  const refresh = useCallback(
    async (quiet = false, signal?: AbortSignal) => {
      if (busyRef.current) return;
      if (!quiet) setLoading(true);
      let requestToken: string | null = null;
      try {
        const token = getSessionToken();
        requestToken = token;
        if (!token) throw new Error("请先登录 Mira Cloud Account。");
        const result = await client.status(token, signal);
        if (signal?.aborted) return;
        applySnapshot(result);
        setError("");
      } catch (cause) {
        if (signal?.aborted) return;
        if (cause instanceof DcControlError && cause.httpStatus === 401 && requestToken) {
          // The poller retries on its next tick with whatever token is current
          // then, so invalidation only needs to drop the failed bearer.
          revokeFailedSession(requestToken, getSessionToken, invalidateSession);
          return;
        }
        setSnapshot(null);
        setError(errorMessage(cause));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [applySnapshot, client, getSessionToken, invalidateSession],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refresh(false, controller.signal);
    const polling = window.setInterval(() => {
      if (!document.hidden) void refresh(true);
    }, 10_000);
    const countdown = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => {
      controller.abort();
      window.clearInterval(polling);
      window.clearInterval(countdown);
    };
  }, [refresh]);

  useEffect(() => {
    if (!stopOpen) return;
    const dialog = stopDialog.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
    };
  }, [stopOpen]);

  async function perform(action: Action) {
    if (busyRef.current || !snapshot || !draft) return;
    const token = getSessionToken();
    if (!token) {
      setError("请重新登录 Mira Cloud Account。");
      return;
    }
    busyRef.current = true;
    setBusy(action);
    setNotice("");
    setError("");
    let completed = false;
    let policySavedBeforeStart = false;
    try {
      let result: DcStatus;
      if (action === "save") {
        result = await client.savePolicy(token, draft);
        setNotice("运行策略已保存，下次启动生效。");
      } else if (action === "start") {
        if (!sameDcPolicy(draft, snapshot.policy)) {
          await client.savePolicy(token, draft);
          policySavedBeforeStart = true;
        }
        result = await client.start(token);
        setNotice("启动命令已执行，远程连接状态请以设备端为准。");
      } else {
        result = await client.stop(token);
        setNotice("DC 服务已停止。");
      }
      lastPolicy.current = result.policy;
      setDraft({ ...result.policy });
      setSnapshot(result);
      setLastRead(Date.now());
      setClock(Date.now());
      completed = true;
    } catch (cause) {
      if (cause instanceof DcControlError && cause.httpStatus === 401) {
        const { rotated } = revokeFailedSession(token, getSessionToken, invalidateSession);
        // A privileged write is never replayed. If the token had already been
        // renewed the session survives, so staying silent would leave the user
        // believing `start`/`stop`/`save` ran. Say so explicitly; the periodic
        // poller re-reads the authoritative status on its next tick.
        if (rotated) {
          setNotice("");
          setError(
            policySavedBeforeStart
              ? "运行策略已保存，但 DC 启动未执行，请确认状态后重新提交。"
              : "Cloud Session 已更新，此操作未执行，请重新提交。",
          );
        }
      } else {
        setError(errorMessage(cause));
      }
    } finally {
      busyRef.current = false;
      setBusy(null);
      if (completed) await refresh(true);
    }
  }

  const running = Boolean(snapshot?.running || snapshot?.legacyRunning);
  const legacy = Boolean(snapshot?.legacyRunning && !snapshot?.running);
  const dirty = Boolean(snapshot && draft && !sameDcPolicy(draft, snapshot.policy));
  const remaining =
    snapshot?.running && snapshot.remainingSeconds != null
      ? snapshot.remainingSeconds - Math.floor((clock - lastRead) / 1000)
      : null;
  const inactive = busy !== null || loading || !snapshot;

  function updatePolicy(key: keyof DcPolicy, value: number) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <section className="console-page dc-page">
      <header className="console-page-head">
        <Link className="console-section-link dc-back" to="/account/services">
          关联服务
        </Link>
        <div className="dc-page-heading">
          <div>
            <h1 id="dc-heading" tabIndex={-1}>
              DC 控制台
            </h1>
            <p className="console-page-caption">广州服务器 · Desktop Commander</p>
          </div>
          <span className="dc-state-pill" role="status">
            <span className={running ? "dc-dot dc-dot-on" : "dc-dot"} aria-hidden="true" />
            {loading ? "读取中" : !snapshot ? "无法连接" : running ? "运行中" : "已停止"}
          </span>
        </div>
      </header>

      {error ? (
        <p role="alert" className="cloud-notice cloud-notice-danger dc-feedback">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="cloud-notice cloud-notice-success dc-feedback">
          {notice}
        </p>
      ) : null}

      <div className="dc-layout">
        <section className="dc-panel" aria-labelledby="dc-service-status">
          <div className="dc-panel-head">
            <h2 id="dc-service-status">服务状态</h2>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => void refresh()}
            >
              刷新
            </Button>
          </div>
          <div className="dc-primary-state">
            <strong>
              {loading ? "正在读取…" : !snapshot ? "状态不可用" : running ? "运行中" : "已停止"}
            </strong>
            <span>
              {legacy
                ? "此前的临时试运行服务"
                : running
                  ? "DC 进程已启动"
                  : "按需启动，减少服务器资源占用"}
            </span>
          </div>
          <dl className="console-facts dc-facts">
            <div>
              <dt>本次剩余时间</dt>
              <dd>{legacy ? "临时服务" : remainingLabel(remaining)}</dd>
            </div>
            <div>
              <dt>进程内存</dt>
              <dd>
                {snapshot?.memoryBytes == null
                  ? "—"
                  : Math.round(snapshot.memoryBytes / 1048576) + " MiB"}
              </dd>
            </div>
            <div>
              <dt>主机</dt>
              <dd>广州 · Ubuntu</dd>
            </div>
          </dl>
          <div className="dc-actions">
            <Button size="xl" disabled={inactive || running} onClick={() => void perform("start")}>
              {busy === "start" ? "正在启动…" : "启动 DC"}
            </Button>
            <Button
              variant="outline"
              size="xl"
              disabled={inactive || !running}
              onClick={() => setStopOpen(true)}
            >
              停止服务
            </Button>
          </div>
          <p className="dc-muted">
            {snapshot?.at
              ? "状态更新于 " + new Date(snapshot.at).toLocaleTimeString("zh-CN")
              : "仅管理当前 DC 实例"}
          </p>
        </section>

        <section className="dc-panel" aria-labelledby="dc-run-policy">
          <div className="dc-panel-head">
            <h2 id="dc-run-policy">运行策略</h2>
            <span className="dc-muted">下次启动生效</span>
          </div>
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
                  onClick={() => updatePolicy("durationMinutes", minutes)}
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
                onChange={(e) => updatePolicy("memoryMiB", Number(e.target.value))}
              >
                {dcMemoryLimits.map((v) => (
                  <option value={v} key={v}>
                    {v} MiB
                  </option>
                ))}
              </select>
            </label>
            <label className="dc-field">
              CPU 限额
              <select
                value={draft?.cpuPercent ?? 50}
                disabled={inactive}
                onChange={(e) => updatePolicy("cpuPercent", Number(e.target.value))}
              >
                {dcCpuLimits.map((v) => (
                  <option value={v} key={v}>
                    {v}% 单核
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
              onChange={(e) => updatePolicy("minAvailableMiB", Number(e.target.value))}
            >
              {dcMinimumAvailable.map((v) => (
                <option value={v} key={v}>
                  {v} MiB
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
          <div className="dc-policy-save">
            <Button size="xl" disabled={inactive || !dirty} onClick={() => void perform("save")}>
              {busy === "save" ? "保存中…" : "保存策略"}
            </Button>
          </div>
        </section>
      </div>

      {stopOpen ? (
        <dialog
          ref={stopDialog}
          className="cloud-dialog"
          aria-labelledby="dc-stop-title"
          onCancel={(event) => {
            if (busy !== null) event.preventDefault();
            else setStopOpen(false);
          }}
        >
          <div className="cloud-dialog-head">
            <div>
              <h2 id="dc-stop-title">停止 DC 服务？</h2>
              <p className="cloud-dialog-caption">正在执行的远程操作将中断。其他服务不受影响。</p>
            </div>
          </div>
          <div className="cloud-dialog-footer">
            <Button variant="outline" disabled={busy !== null} onClick={() => setStopOpen(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={() => {
                setStopOpen(false);
                void perform("stop");
              }}
            >
              确认停止
            </Button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
