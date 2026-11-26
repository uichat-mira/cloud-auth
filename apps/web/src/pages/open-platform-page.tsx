import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/ui/page-head";

const trustChain = [
  { label: "Mira ID 账号", index: "01", meta: "登录与会话" },
  { label: "已登记实例", index: "02", meta: "部署者持有 · APP_ID / AppSecret" },
  { label: "用户授权", index: "03", meta: "OAuth · PKCE S256" },
  { label: "Mira 终端", index: "04", meta: "服务目录 · 短期凭据" },
] as const;

export function OpenPlatformPage() {
  return (
    <div className="open-platform">
      <section className="open-platform-hero" aria-labelledby="open-platform-title">
        <div className="open-platform-hero-copy">
          <p className="open-platform-eyebrow">Mira ID · 开放平台</p>
          <PageHead
            id="open-platform-title"
            title={
              <>
                把 Mira ID <span className="open-platform-nowrap">延伸到你的应用</span>
              </>
            }
            caption="统一账号、实例登记与用户授权，让独立部署的应用接入 Mira 的设备与服务网络。"
          />

          <div className="open-platform-actions">
            <Button asChild size="xl">
              <Link to="/login">
                登录后登记应用
                <span aria-hidden="true">→</span>
              </Link>
            </Button>
            <Link className="open-platform-text-link" to="/docs/open-platform-developer-guide">
              阅读开发指南
              <span aria-hidden="true">→</span>
            </Link>
          </div>

          <p className="open-platform-status-line">
            <span className="open-platform-status-dot" aria-hidden="true" />
            <span>V1 预览 · 开发环境已实现登记、OAuth 与服务目录；生产验收待完成。</span>
          </p>
        </div>

        <aside className="open-platform-trust" aria-label="Mira ID 信任链">
          <div className="open-platform-trust-head">
            <p className="open-platform-mono-label">Trust chain</p>
            <p className="open-platform-mono-label">01—04</p>
          </div>
          <ol className="open-platform-chain">
            {trustChain.map((link) => (
              <li key={link.index}>
                <span className="open-platform-chain-dot" aria-hidden="true" />
                <div>
                  <p className="open-platform-chain-label">
                    {link.label} <span className="open-platform-chain-index">{link.index}</span>
                  </p>
                  <p className="open-platform-chain-meta">{link.meta}</p>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>
    </div>
  );
}
