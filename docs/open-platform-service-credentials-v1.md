# Mira ID 开放平台：实例级服务目录与短期凭据 V1（OPS-052 子集）

- 维护方：cloud-auth / Mira ID；2026-11-25。
- 状态：本文件描述 OPS-052 已在代码中实现的实例级目录、复合身份、服务粒度撤权与短期凭据。真实 OAuth 登录 → 账号 grant 的写入权威仍属于 OPS-051（#211）；在 #211 合并并以 dev 真实联验前，本文不宣称完整 OAuth→grant 链路已验收。
- 协议语义总纲见 [应用接入协议 V1](open-platform-protocol-v1.md)。V0 运行事实见 [服务登记 V0](service-registry-v0.md) 与 [服务凭据 V0](service-credentials-v0.md)。

## 1. 边界与权威

OPS-052 的 canonical service identity 是：

```text
APP_ID + serviceId + resource
```

- `APP_ID` 是已登记部署实例身份，来自 `application_instances` 与已验证 manifest。
- `serviceId` 只在该实例内唯一；两个 APP_ID 可以声明相同 `serviceId` 和相同本地资源名。
- `resource` 是该实例声明的精确受保护 HTTPS URI，同时作为短期凭据的 `aud`。
- 裸 `serviceId`、`projectId`、旧 `mira:service:<serviceId>` audience 都不是实例级服务身份。

职责分工：

| 能力 | 权威 |
| --- | --- |
| 实例登记、origin、manifest、ownership | OPS-050（#208，已合并） |
| OAuth client binding、应用专属会话、登录事务内建立账号对 APP_ID 的 grant 及声明快照 | OPS-051（#211） |
| 实例级目录、服务粒度撤权、短期凭据、声明/授权修订隔离 | OPS-052（本卡） |

本卡不新建第二套 OAuth grant 权威。OPS-051 的登录事务通过
`ApplicationServiceRepository.establishLoginGrants(accountId, appId, manifestRevision)`
写入唯一 grant 台账 `application_service_grants`；本卡的目录、撤权和取票只消费这份台账。

## 2. 持久化与迁移

Migration `017_application_service_grants.sql` 建立：

```text
application_service_grants(
  account_id, app_id, service_id, project_id, resource,
  definition_json, manifest_revision, revision,
  granted_at, updated_at, revoked_at
)
PRIMARY KEY (account_id, app_id, service_id)
```

- `definition_json` 是登录时授权到的服务声明快照（scopes 已规范排序）。
- `revision` 是账号 grant 修订，撤权或重新建立时递增；它是客户端缓存失效依据。
- 声明本身没有独立 revision；使用实例 manifest 中的服务声明内容作精确指纹。
- 本迁移从 017 起，避开 OPS-051 预留的 015/016。

## 3. 目录

```http
GET /v1/application-services
Authorization: Bearer <device-bound Cloud Session>
```

成功返回 `Cache-Control: no-store`：

```json
{
  "services": [
    {
      "appId": "app-mail-a-0001",
      "projectId": "mail",
      "serviceId": "mail",
      "name": "邮件服务",
      "type": "mcp",
      "protocol": {
        "name": "mcp",
        "version": "2026-07-28",
        "endpoint": "https://mail-a.example/mcp"
      },
      "resource": "https://mail-a.example/mcp",
      "scopes": ["mail.read"],
      "revision": 3,
      "manifestRevision": 7,
      "capabilities": [],
      "toolGovernance": [],
      "extensions": {}
    }
  ]
}
```

- 只返回当前账号有效、未撤销且与实例当前声明精确匹配的 grant。
- `revision` 是账号 grant 修订；`manifestRevision` 是当前实例 manifest 修订。
- 声明新增、删除、resource/endpoint/scopes 等发生变化后，旧 grant 不再出现在目录中，直到一次新的成功主动登录按当前声明刷新。
- 目录只是发现与声明信息，不是工具 schema、执行授权或业务权限。`capabilities`、`toolGovernance`、`extensions` 是 Mira 外层语义/治理提示，不替代标准 MCP `tools/list`、ToolAnnotations 或服务自身授权。

## 4. 短期凭据

```http
POST /v1/application-services/{appId}/{serviceId}/credential
Authorization: Bearer <device-bound Cloud Session>
Content-Type: application/json

{
  "resource": "https://mail-a.example/mcp",
  "expectedRevision": 3
}
```

成功返回：

```json
{
  "token": "<compact EdDSA JWS>",
  "tokenType": "Bearer",
  "appId": "app-mail-a-0001",
  "serviceId": "mail",
  "resource": "https://mail-a.example/mcp",
  "revision": 3,
  "scopes": ["mail.read"],
  "expiresAt": "2026-11-25T10:05:00.000Z"
}
```

签发边界：

- 必须是有效的 **device-bound** Cloud Session；账号、设备、session、设备撤销、账号停用均在现有 `BEGIN IMMEDIATE` 事务内复核。
- 客户端只能选择路径中具体 `appId`、`serviceId` 和 body 中精确 `resource`；不能提交账号、设备、issuer、kid、scope 或 audience。
- 必须与当前 grant 的 `appId + serviceId + resource` 和 `expectedRevision` 一致。
- 跨实例、跨账号、foreign resource、缺失/撤销 grant 统一为 `404 APPLICATION_SERVICE_NOT_FOUND`。
- 声明已变化为 `409 APPLICATION_SERVICE_DECLARATION_CHANGED`；revision 不匹配为 `409 APPLICATION_SERVICE_CHANGED`。
- 无凭据签名配置为 `503 APPLICATION_SERVICE_UNAVAILABLE`。
- 响应不包含 Cloud Session；服务凭据反向不能扩大 Cloud Session 权限。

### JWT claims

```json
{
  "iss": "mira:cloud-auth",
  "sub": "<Mira Cloud account id>",
  "device_id": "<Mira Device id>",
  "aud": "https://mail-a.example/mcp",
  "app_id": "app-mail-a-0001",
  "service_id": "mail",
  "resource": "https://mail-a.example/mcp",
  "scope": ["mail.read"],
  "iat": 1790000000,
  "nbf": 1790000000,
  "exp": 1790000300
}
```

- `aud` 必须等于 `resource`；`app_id`、`service_id`、`resource` 必须同时存在。
- 使用现有 Ed25519/EdDSA signer、JWKS、最大 600 秒 TTL 与离线验签基础设施。
- `scope` 是授权时声明快照中的规范化 scope，不得由客户端追加或扩大。
- 未知 claims 被严格拒绝。
- 验签方必须显式配置可信 issuer、APP_ID、serviceId、resource 和公钥；`verifyApplicationServiceCredential` 同时校验这四项。仅校验 `aud` 或仅校验 `serviceId` 不足以隔离同名实例。
- 该 claims 形状与 V0 canonical/裸 `mira:service:<serviceId>` claims 分离；V0 verifier 不接受实例凭据，实例 verifier 不接受 V0 裸 serviceId 凭据。

## 5. 服务粒度撤权

```http
POST /v1/application-services/{appId}/{serviceId}/revoke
Authorization: Bearer <Cloud Session>
Content-Type: application/json

{
  "resource": "https://mail-a.example/mcp",
  "expectedRevision": 3
}
```

成功返回 `{"revision":4}`。

- 只影响当前账号对该 `appId + serviceId` 的 grant；不删除实例 ownership，不影响其他账号或其他实例。
- 撤权递增 revision、写 tombstone、立即移出目录并停止新凭据签发。
- 已签发的离线凭据只能在真实 `exp` 前继续被验签；本服务不声称可瞬时撤销离线票据。
- 一次新的成功主动登录可按实例当前合法声明重新建立 grant；旧授权码不得越过撤权恢复。
- 重复撤权在当前 revision 上幂等；stale revision 返回 409。

## 6. 声明变化、失效与修订

- grant 只在 `definition_json` 与实例当前服务声明精确一致时可用。
- 声明 endpoint、resource、scopes、type 等变化后，旧 grant 立即从目录隐藏，新凭据签发失败，直到重新登录授权当前声明。
- 不静默扩大 scope：客户端持有的旧 catalog 条目不能用于新声明；旧 ticket 只在自身 `exp` 前有效。
- 应用实例停用/删除由 OPS-051 与实例管理边界负责；实例行不存在时本卡 fail closed。当前 `application_instances` 尚无独立 `disabled_at` 列，这是本卡的已知对齐缺口，不得用删除 grant 冒充产品停用语义。

## 7. 消费者与切换顺序

已知仍依赖 V0 路径的面：

| 消费者/面 | 当前依赖 | 切换顺序 |
| --- | --- | --- |
| OAuth 登录事务（#211） | `oauth_cloud_applications`、`service_registrations` | 1. #211 在登录事务内改走 `establishLoginGrants`，并移除开放应用 Cloud Session 产物 |
| Mira Mobile | `/v1/services` + `/v1/services/:serviceId/credential`，裸 `mira:service:*` audience | 2. 切到 `/v1/application-services` + 实例凭据；校验 APP_ID/serviceId/resource |
| Who You Web BFF | `/v1/service-credentials` canonical `mira:who-you` | 3. 先按 #211 冻结的应用会话迁移，再评估是否使用实例凭据；Who You 业务 scope/确认语义不变 |
| 运维 CLI / smoke | `service-register`、`service-revoke`、`/v1/services` | 4. 在真实消费者迁移后删除 V0 route/CLI 入口，并保留负向测试 |
| 原生 Relay/Desktop/Mobile Cloud Session | 不变的 Cloud Session / Relay ticket 能力 | 不迁移，不得被本卡误伤 |

本卡不提供 V0 adapter、双读写、alias 或 legacy fallback。旧 V0 route 的删除必须等真实消费者切换完成；在 #211 未落地前，本卡只提供新 V1 面并证明跨契约不能互相消费，不能宣称旧入口已经下线。

## 8. 验证与未完成项

已实现并可执行验证：

- contracts：复合身份、catalog 条目、binding request、app claims、响应/错误 shape，以及 V0 裸 serviceId claims 不属于实例契约。
- integration（真实 SQLite + 设备 Cloud Session + HTTP + 真实 EdDSA/JWKS）：
  - 两个 APP_ID 声明同一 `serviceId` 时互不碰撞；
  - 只为已授权实例取票，跨实例/跨账号/错 resource/错 revision/撤权均拒绝；
  - 声明变化后旧 binding 失效、不静默扩 scope，旧 ticket 按真实 exp 过期；
  - 普通登录不创建 grant，V0 裸 serviceId 凭据不能被实例 verifier 接受，实例凭据也不能被 V0 verifier 接受。

尚未完成、必须在 #211 落地后的 dev 对齐并真实联验：

- 真实 OAuth 登录 A → 登录事务调用 `establishLoginGrants(A)` → catalog/credential HTTP 全链路；
- 登录 B、普通 Mira Cloud 登录、已有 Cloud Session 不旁路创建 A grant 的真实联验；
- 应用停用状态列/状态机与 #211 的最终接口对齐；
- 旧 V0 route/schema/audience 的最终删除和负向证据（依赖 Mobile/Who You/运维消费者实际切换顺序）。
