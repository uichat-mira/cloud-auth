import { FutureServices } from "@/components/future-services";

/**
 * /account/services — what this Portal deliberately does not connect yet. The
 * page owns the heading; the list only renders records.
 */
export function ServicesPage() {
  return (
    <section className="console-page">
      <header className="console-page-head">
        <h1 id="future-services-heading" tabIndex={-1}>
          关联服务
        </h1>
        <p className="console-page-caption">
          以下能力尚未接入此 Portal，不影响当前账号及设备授权。
        </p>
      </header>

      <FutureServices />
    </section>
  );
}
