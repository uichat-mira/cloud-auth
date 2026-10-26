import {
  isRouteErrorResponse,
  Link,
  useRouteError,
} from "react-router-dom";
import { PortalShell } from "@/app/root-layout";
import { Button } from "@/components/ui/button";

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

  return (
    <PortalShell>
      <section className="mx-auto max-w-md space-y-4 py-12 text-center sm:py-20">
        <p className="font-mono text-sm text-muted-foreground">Error</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          页面暂时无法显示
        </h1>
        <p className="text-sm leading-6 text-muted-foreground">
          {describeError(error)}
        </p>
        <div className="flex justify-center pt-2">
          <Button asChild>
            <Link to="/login">返回登录</Link>
          </Button>
        </div>
      </section>
    </PortalShell>
  );
}
