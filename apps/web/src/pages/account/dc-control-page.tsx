import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Facts } from "@/components/ui/facts";
import { Notice } from "@/components/ui/notice";
import { PageHead } from "@/components/ui/page-head";
import { DcPolicyDialog } from "@/components/dc/dc-policy-dialog";
import { DcStopDialog } from "@/components/dc/dc-stop-dialog";
import { errorMessage, remainingLabel } from "@/components/dc/dc-format";
import { useAuthSession } from "@/lib/auth/context";
import { revokeFailedSession } from "@/lib/auth/reauth";
import {
  createDcControlClient,
  DcControlError,
  sameDcPolicy,
  type DcPolicy,
  type DcStatus,
  type DcNode,
} from "@/lib/dc-control";

type Action = "start" | "stop" | "save";

/** An account-owned view; the privileged HTTP service remains on the host. */
export function DcControlPage() {
  return (
    <section className="console-page dc-page">
      <PageHead
        id="dc-heading"
        title="DC 控制台"
        caption="广州服务器 · Desktop Commander · 按需启动"
        back={{ to: "/account/services", label: "关联服务" }}
      />
      <div className="dc-layout">
        <DcNodeCard node="aliyun" />
        <DcNodeCard node="tencent" />
      </div>
    </section>
  );
}

function DcNodeCard({ node }: { node: DcNode }) {
  const { getSessionToken, invalidateSession } = useAuthSession();
  const client = useMemo(() => createDcControlClient(), []);
  const nodeName = node === "aliyun" ? "阿里云 · 原节点" : "腾讯云 · 新节点";
  const [snapshot, setSnapshot] = useState<DcStatus | null>(null);
  const [draft, setDraft] = useState<DcPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [stopOpen, setStopOpen] = useState(false);
  const [lastRead, setLastRead] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const lastPolicy = useRef<DcPolicy | null>(null);
  const busyRef = useRef(false);

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
        if (!token) throw new Error("请先登录 Mira 账号。");
        const result = await client.status(token, signal, node);
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
    [applySnapshot, client, getSessionToken, invalidateSession, node],
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

  async function perform(action: Action): Promise<boolean> {
    if (busyRef.current || !snapshot || !draft) return false;
    const token = getSessionToken();
    if (!token) {
      if (action === "save") setPolicyError("请重新登录 Mira 账号。");
      else setError("请重新登录 Mira 账号。");
      return false;
    }
    busyRef.current = true;
    setBusy(action);
    setNotice("");
    setError("");
    setPolicyError("");
    let completed = false;
    let policySavedBeforeStart = false;
    try {
      let result: DcStatus;
      if (action === "save") {
        result = await client.savePolicy(token, draft, node);
        setNotice("运行策略已保存，下次启动生效。");
      } else if (action === "start") {
        if (!sameDcPolicy(draft, snapshot.policy)) {
          await client.savePolicy(token, draft, node);
          policySavedBeforeStart = true;
        }
        result = await client.start(token, node);
        setNotice("启动命令已执行，远程连接状态请以设备端为准。");
      } else {
        result = await client.stop(token, node);
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
          const message = policySavedBeforeStart
            ? "运行策略已保存，但 DC 启动未执行，请确认状态后重新提交。"
            : "Cloud Session 已更新，此操作未执行，请重新提交。";
          if (action === "save") setPolicyError(message);
          else setError(message);
        }
      } else {
        if (action === "save") setPolicyError(errorMessage(cause));
        else setError(errorMessage(cause));
      }
    } finally {
      busyRef.current = false;
      setBusy(null);
      if (completed) await refresh(true);
    }
    return completed;
  }

  const running = Boolean(snapshot?.running || snapshot?.legacyRunning);
  const legacy = Boolean(snapshot?.legacyRunning && !snapshot?.running);
  const dirty = Boolean(snapshot && draft && !sameDcPolicy(draft, snapshot.policy));
  const remaining =
    snapshot?.running && snapshot.remainingSeconds != null
      ? snapshot.remainingSeconds - Math.floor((clock - lastRead) / 1000)
      : null;
  const inactive = busy !== null || loading || !snapshot;

  function openPolicy() {
    if (!snapshot || inactive) return;
    setDraft({ ...snapshot.policy });
    setPolicyError("");
    setPolicyOpen(true);
  }

  function closePolicy() {
    if (busyRef.current) return;
    setDraft(snapshot ? { ...snapshot.policy } : null);
    setPolicyError("");
    setPolicyOpen(false);
  }

  function updatePolicy(key: keyof DcPolicy, value: number) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  return (
    <section className="dc-panel" aria-labelledby={`dc-node-title-${node}`}>
      <header className="dc-node-head">
        <div className="dc-node-identity">
          <h2 id={`dc-node-title-${node}`}>{nodeName}</h2>
          <p>广州 · Ubuntu · Desktop Commander</p>
        </div>
        <span className="dc-state-pill">
          <span className={running ? "dc-dot dc-dot-on" : "dc-dot"} aria-hidden="true" />
          {loading ? "读取中" : !snapshot ? "无法连接" : running ? "运行中" : "已停止"}
        </span>
      </header>

      {error ? (
        <Notice tone="danger" className="dc-feedback">
          {error}
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone="success" className="dc-feedback">
          {notice}
        </Notice>
      ) : null}

      <div className="dc-panel-head">
        <h3>服务状态</h3>
        <div className="dc-panel-tools">
          <Button variant="ghost" size="sm" disabled={inactive} onClick={openPolicy}>
            运行策略
          </Button>
          <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => void refresh()}>
            刷新
          </Button>
        </div>
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
      <Facts
        align="end"
        className="dc-facts"
        items={[
          { label: "本次剩余时间", value: legacy ? "临时服务" : remainingLabel(remaining) },
          {
            label: "进程内存",
            value:
              snapshot?.memoryBytes == null
                ? "—"
                : Math.round(snapshot.memoryBytes / 1048576) + " MiB",
          },
          {
            label: "主机",
            value: `${node === "aliyun" ? "阿里云" : "腾讯云"} · 广州 · Ubuntu`,
          },
        ]}
      />
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

      {policyOpen ? (
        <DcPolicyDialog
          node={node}
          draft={draft}
          busy={busy !== null}
          saving={busy === "save"}
          inactive={inactive}
          dirty={dirty}
          policyError={policyError}
          onUpdate={updatePolicy}
          onClose={closePolicy}
          onSubmit={() => {
            void perform("save").then((saved) => {
              if (saved) setPolicyOpen(false);
            });
          }}
        />
      ) : null}

      {stopOpen ? (
        <DcStopDialog
          nodeName={nodeName}
          node={node}
          busy={busy !== null}
          onCancel={() => setStopOpen(false)}
          onConfirm={() => {
            setStopOpen(false);
            void perform("stop");
          }}
        />
      ) : null}
    </section>
  );
}
