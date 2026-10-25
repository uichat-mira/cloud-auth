import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const futureServices = [
  {
    name: "Cloud Shiyan",
    description: "云端服务授权尚未接入。",
    detail: "登录 Mira Cloud Account 不会授予 Shiyan 业务权限。",
  },
  {
    name: "Hosted Relay",
    description: "托管服务凭据尚未接入。",
    detail: "本地、直连与 Tailscale 路径仍然不依赖此账号。",
  },
] as const;

export function FutureServices() {
  return (
    <section aria-labelledby="future-services-heading" className="space-y-3">
      <div className="space-y-1">
        <h2
          id="future-services-heading"
          className="text-lg font-semibold tracking-tight"
        >
          关联服务
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          以下能力尚未连接到此 Portal，仅作为未来集成预览，不会影响当前账户状态。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {futureServices.map((service) => (
          <Card key={service.name} className="gap-3 py-4">
            <CardHeader className="gap-2 px-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{service.name}</CardTitle>
                <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
                  尚未接入
                </span>
              </div>
              <CardDescription>{service.description}</CardDescription>
            </CardHeader>
            <CardContent className="px-4">
              <p className="text-xs leading-5 text-muted-foreground">
                {service.detail}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
