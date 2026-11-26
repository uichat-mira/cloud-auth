import applicationOAuth from "../../../../../docs/application-oauth-v1.md?raw";
import developerGuide from "../../../../../docs/open-platform-developer-guide.md?raw";
import protocolV1 from "../../../../../docs/open-platform-protocol-v1.md?raw";
import serviceCredentials from "../../../../../docs/open-platform-service-credentials-v1.md?raw";
import deployment from "../../../../../docs/deployment.md?raw";
import nonprodEnvironment from "../../../../../docs/engineering/gln-013-nonprod-environment.md?raw";
import nonprodRunbook from "../../../../../docs/engineering/gln-013-nonprod-runbook.md?raw";

export interface DocEntry {
  id: string;
  group: string;
  navLabel: string;
  sourcePath: string;
  body: string;
}

export const docGroups = ["开放平台", "部署与运维"] as const;

export const defaultDocId = "open-platform-developer-guide";

export const docs: DocEntry[] = [
  {
    id: "open-platform-developer-guide",
    group: "开放平台",
    navLabel: "开发指南",
    sourcePath: "docs/open-platform-developer-guide.md",
    body: developerGuide,
  },
  {
    id: "open-platform-protocol-v1",
    group: "开放平台",
    navLabel: "接入协议 V1",
    sourcePath: "docs/open-platform-protocol-v1.md",
    body: protocolV1,
  },
  {
    id: "application-oauth-v1",
    group: "开放平台",
    navLabel: "应用 OAuth V1",
    sourcePath: "docs/application-oauth-v1.md",
    body: applicationOAuth,
  },
  {
    id: "open-platform-service-credentials-v1",
    group: "开放平台",
    navLabel: "实例级服务凭据",
    sourcePath: "docs/open-platform-service-credentials-v1.md",
    body: serviceCredentials,
  },
  {
    id: "deployment",
    group: "部署与运维",
    navLabel: "部署与排障",
    sourcePath: "docs/deployment.md",
    body: deployment,
  },
  {
    id: "nonprod-environment",
    group: "部署与运维",
    navLabel: "非生产环境",
    sourcePath: "docs/engineering/gln-013-nonprod-environment.md",
    body: nonprodEnvironment,
  },
  {
    id: "nonprod-runbook",
    group: "部署与运维",
    navLabel: "非生产 Runbook",
    sourcePath: "docs/engineering/gln-013-nonprod-runbook.md",
    body: nonprodRunbook,
  },
];

export function getDoc(id: string | undefined): DocEntry | undefined {
  if (!id) return undefined;
  return docs.find((doc) => doc.id === id);
}

export function docsInGroup(group: string): DocEntry[] {
  return docs.filter((doc) => doc.group === group);
}
