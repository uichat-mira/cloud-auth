import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";
import { getAccountEntry } from "@/lib/auth/account-entry";

/**
 * Public account entry. It is a console page, not a landing page: one factual
 * head, the single contextual entry action, and the destinations that the
 * console owns. No illustration, no slogans — `/` has to read as the same
 * product as `/login` and `/account`.
 */
const destinations = [
  {
    name: "设备与授权",
    description: "查看 Desktop Host 与手机设备，调整或撤销已授予的访问权限。",
    href: "/account/devices",
    icon: "devices",
  },
  {
    name: "账户安全",
    description: "修改密码，管理当前浏览器的登录会话。",
    href: "/account/security",
    icon: "security",
  },
] as const;

export function HomePage() {
  const { status } = useAuthSession();
  const { checking, destination, homeLabel } = getAccountEntry(status);

  return (
    <div className="cloud-home">
      <header className="console-page-head">
        <h1 id="home-title">Mira Cloud 账户</h1>
        <p className="console-page-caption">登录后查看 Mira 设备、调整访问授权，并管理账户安全。</p>
      </header>

      <div className="cloud-home-entry">
        {checking ? (
          <p role="status" className="cloud-home-checking">
            正在检查登录状态…
          </p>
        ) : (
          <Button asChild size="xl">
            <Link to={destination}>
              {homeLabel}
              <span aria-hidden="true">→</span>
            </Link>
          </Button>
        )}
      </div>

      <section className="cloud-home-sections" aria-label="账户功能">
        <ul className="cloud-home-list">
          {destinations.map((item) => (
            <li key={item.name}>
              <Link className="cloud-home-row" to={item.href}>
                <span className="cloud-home-row-icon" aria-hidden="true">
                  <CapabilityIcon kind={item.icon} />
                </span>
                <span className="cloud-home-row-body">
                  <span className="cloud-home-row-title">{item.name}</span>
                  <span className="cloud-home-row-caption">{item.description}</span>
                </span>
                <span className="cloud-home-row-trail" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
          <li>
            <div className="cloud-home-row cloud-home-row-static">
              <span className="cloud-home-row-icon" aria-hidden="true">
                <CapabilityIcon kind="services" />
              </span>
              <span className="cloud-home-row-body">
                <span className="cloud-home-row-title">关联服务</span>
                <span className="cloud-home-row-caption">
                  Cloud Shiyan 与 Hosted Relay 尚未接入此门户，登录不会自动授予服务权限。
                </span>
              </span>
              <span className="cloud-home-pill">尚未接入</span>
            </div>
          </li>
        </ul>
      </section>

      <p className="cloud-home-boundary">本地、直连与 Tailscale 路径无需登录，依然可以独立使用。</p>
    </div>
  );
}

const capabilityIconPaths = {
  devices: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 16v5" />
    </>
  ),
  security: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
  services: (
    <path
      d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"
      transform="translate(1 0) scale(.92)"
    />
  ),
};

function CapabilityIcon({ kind }: { kind: keyof typeof capabilityIconPaths }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {capabilityIconPaths[kind]}
    </svg>
  );
}
