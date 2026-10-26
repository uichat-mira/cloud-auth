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

/** Used by the overview page summary line so the count cannot drift. */
export const futureServicesCount = futureServices.length;

/**
 * Rows only: the page heading and caption belong to the route, so this
 * component stays usable anywhere a plain list is needed.
 */
export function FutureServices() {
  return (
    <ul className="cloud-future-list">
      {futureServices.map((service) => (
        <li key={service.name} className="cloud-future-row">
          <div className="cloud-future-row-head">
            <span className="cloud-future-name">{service.name}</span>
            <span className="cloud-future-pill">尚未接入</span>
          </div>
          <p className="cloud-future-description">{service.description}</p>
          <p className="cloud-future-detail">{service.detail}</p>
        </li>
      ))}
    </ul>
  );
}
