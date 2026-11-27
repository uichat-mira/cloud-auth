import { AssociatedServices } from "@/components/associated-services";
import { InstanceServices } from "@/components/instance-services";

/** /account/services — open-application authorizations and first-party Mira services. */
export function ServicesPage() {
  return (
    <section className="console-page">
      <header className="console-page-head">
        <h1 id="associated-services-heading" tabIndex={-1}>
          关联服务
        </h1>
        <p className="console-page-caption">管理已授权应用，以及 Mira 自身提供的服务。</p>
      </header>

      <InstanceServices />
      <AssociatedServices />
    </section>
  );
}
