import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";
import { PortalShell } from "@/app/root-layout";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";
import { getAccountEntry } from "@/lib/auth/account-entry";

function describeError(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return `${error.status} ${error.statusText}`.trim();
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "发生了未知错误。";
}

export function RouteErrorPage() {
  const error = useRouteError();
  const { status } = useAuthSession();
  const { destination } = getAccountEntry(status);

  return (
    <PortalShell>
      <section className="cloud-page-state">
        <p className="cloud-state-code">Error</p>
        <h1>页面暂时无法显示</h1>
        <p className="cloud-state-body">{describeError(error)}</p>
        <div className="cloud-state-actions">
          <Button asChild size="lg">
            <Link to={destination}>
              {destination === "/account" ? "返回账户中心" : "返回登录"}
            </Link>
          </Button>
        </div>
      </section>
    </PortalShell>
  );
}
