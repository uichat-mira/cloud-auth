import { InstanceServices } from "@/components/instance-services";
import { MiraServices } from "@/components/mira-services";
import { PageHead } from "@/components/ui/page-head";

/**
 * /account/services — two separate relations, never merged:
 * - 已授权应用服务: the account's real grants, from `/v1/application-services`.
 * - Mira 服务: first-party entry points that this console owns links to.
 * Registration/ownership lives in 我的应用 and does not produce a grant here.
 */
export function ServicesPage() {
  return (
    <section className="console-page">
      <PageHead
        id="associated-services-heading"
        title="关联服务"
        caption="这里只列出你的 Mira ID 账号已获得使用授权的服务。"
      />

      <InstanceServices />
      <MiraServices />
    </section>
  );
}
