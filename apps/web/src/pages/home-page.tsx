import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";
import { getAccountEntry } from "@/lib/auth/account-entry";

/**
 * Public identity home. It presents the Mira ID position — one identity across
 * the ecosystem — while keeping the single contextual entry and the account
 * destinations that the public portal owns.
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
      <section className="cloud-home-identity" aria-labelledby="home-title">
        <div className="cloud-home-copy">
          <p className="cloud-home-eyebrow">Mira ID · 统一身份</p>
          <h1 id="home-title" tabIndex={-1} className="cloud-home-title">
            Mira 账号
          </h1>
          <p className="cloud-home-lead">
            一个 Mira 账号，连接 Mira Desktop、Mobile 与云端服务。身份应当始终可靠，但不应成为负担。
          </p>

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
        </div>

        <aside className="cloud-home-brand" aria-label="Mira ID 品牌">
          <span aria-hidden="true" className="cloud-home-brand-tile">
            <img src="/brand/mira-id/svg/mira-id-app.svg" alt="" width={96} height={96} />
          </span>
          <p className="cloud-home-brand-name">Mira ID · 独立云身份</p>
          <p className="cloud-home-brand-line">
            One identity.
            <br />
            Across Mira.
          </p>
          <p className="cloud-home-brand-caption">
            安静、可靠的身份底座，让同一份身份贯穿你的设备与服务。
          </p>
          <p className="cloud-home-brand-pillars">
            <span>身份</span>
            <span>设备</span>
            <span>服务</span>
          </p>
        </aside>
      </section>

      <section className="cloud-home-capabilities" aria-labelledby="home-capabilities-title">
        <header className="cloud-home-section-head">
          <h2 id="home-capabilities-title">账户入口</h2>
          <p>设备授权、账户安全与关联服务，都归在同一个 Mira 账号下。</p>
        </header>

        <ul className="cloud-home-card-list">
          {destinations.map((item) => (
            <li key={item.name}>
              <Link className="cloud-home-card" to={item.href}>
                <span className="cloud-home-card-icon" aria-hidden="true">
                  <CapabilityIcon kind={item.icon} />
                </span>
                <span className="cloud-home-card-body">
                  <span className="cloud-home-card-title">{item.name}</span>
                  <span className="cloud-home-card-caption">{item.description}</span>
                </span>
                <span className="cloud-home-card-trail" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link className="cloud-home-card" to="/account/services">
              <span className="cloud-home-card-icon" aria-hidden="true">
                <CapabilityIcon kind="services" />
              </span>
              <span className="cloud-home-card-body">
                <span className="cloud-home-card-title">关联服务</span>
                <span className="cloud-home-card-caption">
                  查看你的账号已获得使用授权的应用服务；Mira 自有服务入口在同一页单独列出。
                </span>
              </span>
              <span className="cloud-home-card-trail" aria-hidden="true">
                →
              </span>
            </Link>
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
