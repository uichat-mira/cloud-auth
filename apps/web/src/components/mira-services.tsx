import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Section, SectionHead } from "@/components/ui/section";

type MiraServiceEntry = {
  name: string;
  description: string;
  detail: string;
  href?: string;
};

/**
 * Mira's own service entry points. These are capabilities this console can link
 * to — not account authorizations. Anything the account has actually been
 * granted is served by `InstanceServices` from `/v1/application-services`, and
 * nothing here may stand in for one. The console must not know a specific
 * third-party application (Who You, a future MCP server) in advance: a service
 * appears under 关联服务 only because the authorization catalog returned it.
 */
const entries: readonly MiraServiceEntry[] = [
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
 * Mira-owned entry points, kept in their own section so they cannot be read as
 * grants. DC owns its own runtime and server-side permission checks.
 */
export function MiraServices() {
  return (
    <Section labelledBy="mira-services">
      <SectionHead
        id="mira-services"
        title="Mira 服务"
        caption="Mira 自有服务入口。这里的条目是服务能力，不代表账号已获得授权；账号授权以「已授权应用服务」为准。"
      />
      <ul className="cloud-service-list">
        {entries.map((entry) => (
          <li key={entry.name} className="cloud-service-row">
            <div className="cloud-service-row-head">
              <span className="cloud-service-name">{entry.name}</span>
              {entry.href ? (
                <Link className="console-section-link" to={entry.href}>
                  进入 {entry.name}
                </Link>
              ) : (
                <Badge tone="neutral">尚未接入</Badge>
              )}
            </div>
            <p className="cloud-service-description">{entry.description}</p>
            <p className="cloud-service-detail">{entry.detail}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
