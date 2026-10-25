import type { RemoteDeviceScope } from "@uichat-mira/cloud-auth-contracts";

export const remoteScopeLabels: Record<RemoteDeviceScope, string> = {
  "threads:read": "读取会话",
  "messages:read": "读取消息",
  "messages:write": "发送消息",
  "agent:read": "查看 Agent",
  "agent:approve": "审批 Agent",
  "agent:control": "控制 Agent",
  "tools:read": "查看工具",
  "tools:invoke": "调用工具",
  "tools:approve": "审批工具",
  "tools:control": "控制工具",
  "artifacts:read": "读取产物",
};
