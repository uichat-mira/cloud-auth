import { AssociatedServices } from "@/components/associated-services";
import { InstanceServices } from "@/components/instance-services";

/** /account/services — links to Mira account subsystems and planned integrations. */
export function ServicesPage() {
  return (
    <section className="console-page">
      <header className="console-page-head">
        <h1 id="associated-services-heading" tabIndex={-1}>
          关联服务
        </h1>
        <p className="console-page-caption">统一管理与 Mira 账号关联的服务。</p>
      </header>

      <InstanceServices />
      <AssociatedServices />
    </section>
  );
}
