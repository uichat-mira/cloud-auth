import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/lib/auth/context";

export function NotFoundPage() {
  const { status } = useAuthSession();
  const accountEntry = status === "authenticated" || status === "unavailable";

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-4 py-12 text-center sm:py-20">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        页面不存在
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        你访问的页面不存在或已被移动。请从 Mira Cloud 入口继续。
      </p>
      <div className="flex justify-center pt-2">
        <Button asChild>
          <Link to={accountEntry ? "/account" : "/login"}>
            {accountEntry ? "返回账户中心" : "前往登录"}
          </Link>
        </Button>
      </div>
    </section>
  );
}
