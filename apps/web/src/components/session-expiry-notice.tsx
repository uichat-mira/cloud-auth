import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";

/** A passive prompt, not a background renewal or a second login system. */
export function SessionExpiryNotice() {
  const { status, expiresAt, pending, renew } = useAuthSession();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "authenticated" || !expiresAt) return;
    const update = () => setNow(Date.now());
    update();
    const interval = window.setInterval(update, 15_000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [status, expiresAt]);

  if (status !== "authenticated" || !expiresAt) return null;
  const remainingMs = Date.parse(expiresAt) - now;
  if (!Number.isFinite(remainingMs) || remainingMs <= 0 || remainingMs > 5 * 60_000) {
    return null;
  }

  return (
    <div className="console-expiry-notice" role="status">
      <span>本次登录将在约 {Math.max(1, Math.ceil(remainingMs / 60_000))} 分钟后过期。</span>
      <Button type="button" size="sm" variant="outline" onClick={() => void renew()} disabled={pending !== null}>
        {pending === "renew" ? "续期中…" : "保持登录"}
      </Button>
    </div>
  );
}
