import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-4 py-12 text-center sm:py-20">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        页面不存在
      </h1>
      <p className="text-sm leading-6 text-muted-foreground">
        你访问的页面不存在或已被移动。请从登录页或账户概览继续。
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Button asChild>
          <Link to="/login">前往登录</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/account">账户概览</Link>
        </Button>
      </div>
    </section>
  );
}
