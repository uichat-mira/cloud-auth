import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";
import { getAccountEntry } from "@/lib/auth/account-entry";

export function NotFoundPage() {
  const { status } = useAuthSession();
  const { destination } = getAccountEntry(status);

  return (
    <section className="cloud-page-state">
      <p className="cloud-state-code">404</p>
      <h1>页面不存在</h1>
      <p className="cloud-state-body">你访问的页面不存在或已被移动。请从 Mira Cloud 入口继续。</p>
      <div className="cloud-state-actions">
        <Button asChild size="lg">
          <Link to={destination}>{destination === "/account" ? "返回账户中心" : "前往登录"}</Link>
        </Button>
      </div>
    </section>
  );
}
