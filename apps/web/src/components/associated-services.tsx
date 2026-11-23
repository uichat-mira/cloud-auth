import { Link } from "react-router-dom";

type AssociatedService = {
  name: string;
  description: string;
  detail: string;
  href?: string;
  /** First-party services hosted on another origin leave the console intact. */
  external?: boolean;
};

const services: readonly AssociatedService[] = [
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
    name: "狐邮 Who You",
    description: "使用 Cloud Auth 身份登录狐邮，具体邮箱在狐邮管理。",
    detail: "Cloud Auth 只管理账号身份与服务授权，邮箱与 provider 凭据由狐邮负责。",
    href: "https://who-you.tomz.io/account",
    external: true,
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

export const associatedServicesCount = services.length;
export const unconnectedServicesCount = services.filter((service) => !service.href).length;

/** Services stay peers here; DC owns its own runtime and server-side permission checks. */
export function AssociatedServices() {
  return (
    <ul className="cloud-service-list">
      {services.map((service) => (
        <li key={service.name} className="cloud-service-row">
          <div className="cloud-service-row-head">
            <span className="cloud-service-name">{service.name}</span>
            {service.href ? (
              service.external ? (
                <a
                  className="console-section-link"
                  href={service.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  进入 {service.name}
                </a>
              ) : (
                <Link className="console-section-link" to={service.href}>
                  进入 {service.name}
                </Link>
              )
            ) : (
              <span className="cloud-service-pill">尚未接入</span>
            )}
          </div>
          <p className="cloud-service-description">{service.description}</p>
          <p className="cloud-service-detail">{service.detail}</p>
        </li>
      ))}
    </ul>
  );
}
