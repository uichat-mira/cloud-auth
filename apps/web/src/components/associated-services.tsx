import { Link } from "react-router-dom";

type MiraService = {
  name: string;
  description: string;
  detail: string;
  href?: string;
};

const services: readonly MiraService[] = [
  {
    name: "Cloud Agent · 烤派",
    description: "飞书、企业微信、定时研究与云端观澜",
    detail: "由 Mira 账号统一管理服务状态、研究计划和运行记录。",
    href: "/account/services/cloud-agent",
  },
  {
    name: "DC 控制台",
    description: "广州服务器 · Desktop Commander",
    detail: "查看运行状态，管理单次启停与资源策略。",
    href: "/account/services/dc",
  },
  {
    name: "Cloud Shiyan",
    description: "云端服务授权尚未接入。",
    detail: "登录 Mira 账号不会授予 Shiyan 业务权限。",
  },
  {
    name: "Hosted Relay",
    description: "托管服务凭据尚未接入。",
    detail: "本地、直连与 Tailscale 路径仍然不依赖此账号。",
  },
];

/**
 * First-party Mira services stay separate from open-application authorizations.
 * Open applications such as Who You are projected only from the V1 service catalog.
 */
export function AssociatedServices() {
  return (
    <section className="console-section" aria-labelledby="mira-services-heading">
      <div className="console-section-head">
        <div>
          <h2 id="mira-services-heading">Mira 服务</h2>
          <p className="console-section-caption">
            Mira 自身提供或托管的服务，与开放应用授权分开管理。
          </p>
        </div>
      </div>

      <ul className="cloud-service-list">
        {services.map((service) => (
          <li key={service.name} className="cloud-service-row">
            <div className="cloud-service-row-head">
              <span className="cloud-service-name">{service.name}</span>
              {service.href ? (
                <Link className="console-section-link" to={service.href}>
                  进入 {service.name}
                </Link>
              ) : (
                <span className="cloud-service-pill">尚未接入</span>
              )}
            </div>
            <p className="cloud-service-description">{service.description}</p>
            <p className="cloud-service-detail">{service.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
