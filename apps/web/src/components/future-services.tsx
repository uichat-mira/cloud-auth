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
      <h2 id="future-services-heading" className="text-sm font-medium">
        关联服务
      </h2>
      <p className="text-xs leading-5 text-muted-foreground">
        以下能力尚未接入此 Portal，不影响当前账号及设备授权。
      </p>
      <ul className="divide-y border-t text-sm">
        {futureServices.map((service) => (
          <li key={service.name} className="space-y-1 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{service.name}</span>
              <span className="text-xs text-muted-foreground">尚未接入</span>
            </div>
            <p className="text-xs text-muted-foreground">{service.description}</p>
            <p className="text-xs text-muted-foreground">{service.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
