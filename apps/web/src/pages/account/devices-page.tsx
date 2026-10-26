import { DeviceGrantsCard } from "@/components/device-grants-card";

/**
 * /account/devices — the owned records page. The card keeps the heading and
 * live controls; the execution caveat is stated once here.
 */
export function DevicesPage() {
  return (
    <section className="console-page">
      <DeviceGrantsCard />

      <p className="console-note-block">
        云端保存成功不等于 Desktop 已立即执行。Desktop 会在下次同步或授权快照过期后按新范围生效。本地、直连与 Tailscale 路径不受影响。
      </p>
    </section>
  );
}
