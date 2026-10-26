import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";
import { getAccountEntry } from "@/lib/auth/account-entry";

const capabilities = [
  {
    name: "设备与授权",
    description:
      "查看账户下的 Desktop Host 与手机设备，管理已经授予的访问权限。",
    icon: "devices",
    detail: "查看设备 · 调整授权 · 撤销访问",
  },
  {
    name: "账户安全",
    description:
      "管理密码和当前浏览器的登录会话，让云端账户保持在你的掌控之中。",
    icon: "security",
    detail: "修改密码 · 管理会话",
  },
  {
    name: "关联服务",
    description:
      "Cloud Shiyan 与 Hosted Relay 尚未接入此门户，登录不会自动授予服务权限。",
    icon: "services",
    detail: "尚未接入",
  },
] as const;

export function HomePage() {
  const { status } = useAuthSession();
  const { checking, destination, homeLabel } = getAccountEntry(status);

  return (
    <div className="cloud-home">
      <section className="cloud-home-hero" aria-labelledby="home-title">
        <div className="cloud-home-intro">
          <p className="cloud-home-eyebrow">MIRA CLOUD / ACCOUNT</p>
          <h1 id="home-title">你的 Mira 云端账户</h1>
          <p className="cloud-home-lede">
            一个地方，管理你的云身份、设备与授权。
          </p>
          <p className="cloud-home-description">
            从查看已连接的设备，到调整访问权限与保护账户安全，
            让每一次云端连接，都由你决定。
          </p>
          <div className="cloud-home-actions">
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
            <a href="#home-capabilities" className="cloud-home-secondary">
              了解账户功能 <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>

        <div className="cloud-home-visual" aria-hidden="true">
          <div className="cloud-home-orbit cloud-home-orbit-outer" />
          <div className="cloud-home-orbit cloud-home-orbit-inner" />
          <svg
            className="cloud-home-connections"
            viewBox="0 0 400 320"
            fill="none"
          >
            <path d="M106 103 200 160 300 221M200 160 300 83M200 160 99 236" />
          </svg>
          <div className="cloud-home-account">
            <span>M.</span>
            <small>你的云身份</small>
          </div>
          <div className="cloud-home-node cloud-home-node-desktop">
            <CapabilityIcon kind="devices" />
            <span>设备</span>
          </div>
          <div className="cloud-home-node cloud-home-node-security">
            <CapabilityIcon kind="security" />
            <span>安全</span>
          </div>
          <div className="cloud-home-node cloud-home-node-access">
            <CapabilityIcon kind="services" />
            <span>授权</span>
          </div>
          <span className="cloud-home-visual-caption">
            每个连接，都由你掌控
          </span>
        </div>
      </section>

      <section
        id="home-capabilities"
        className="cloud-home-capabilities"
        aria-labelledby="home-capabilities-title"
      >
        <div className="cloud-home-section-head">
          <h2 id="home-capabilities-title">围绕你的账户，井然有序。</h2>
          <p>从设备到权限，清楚了解，也随时可控。</p>
        </div>
        <div className="cloud-home-feature-grid">
          {capabilities.map((capability) => (
            <article className="cloud-home-feature" key={capability.name}>
              <span className="cloud-home-feature-icon">
                <CapabilityIcon kind={capability.icon} />
              </span>
              <h3>{capability.name}</h3>
              <p>{capability.description}</p>
              <small>{capability.detail}</small>
            </article>
          ))}
        </div>
      </section>

      <aside className="cloud-home-local">
        <span className="cloud-home-local-mark" aria-hidden="true">
          <CapabilityIcon kind="security" />
        </span>
        <div>
          <h2>云端相连，本地依然独立。</h2>
          <p>
            Mira Cloud 用于 Mira 运营的云端服务。本地、直连与 Tailscale
            功能无需登录，依然可以独立使用。
          </p>
        </div>
      </aside>
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
