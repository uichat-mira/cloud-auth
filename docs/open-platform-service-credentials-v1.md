# Mira ID 开放平台：实例级服务目录与短期凭据 V1（OPS-052 子集）

- 维护方：cloud-auth / Mira ID；2026-11-25。
- 状态：OPS-050/051/052 的实例登记、应用 OAuth、实例目录和短票已实现；旧开放应用 V0 入口在本次 dev 切换中删除。生产部署与 OPS-053 联验另行判断。
- 协议语义总纲见 [应用接入协议 V1](open-platform-protocol-v1.md)。[服务登记 V0](service-registry-v0.md) 为历史合同；[服务凭据 V0](service-credentials-v0.md) 的 Relay、Guanlan、Shiyan 独立签发仍适用，旧 Who You 签发不再适用。

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
Authorization: Bearer <Cloud Session>
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
- 实例 manifestRevision 变化即使随后恢复原声明也使旧 grant 失效，直至用户主动重新登录。这是当前保守授权策略，不静默恢复旧授权。
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

- grant 只在 `definition_json` 与实例当前服务声明精确一致、manifestRevision 一致且实例启用时可用。
- 声明 endpoint、resource、scopes、type 等变化后，旧 grant 立即从目录隐藏，新凭据签发失败，直到重新登录授权当前声明。
- 不静默扩大 scope：客户端持有的旧 catalog 条目不能用于新声明；旧 ticket 只在自身 `exp` 前有效。
- 应用实例停用由 OPS-051 实现，停用原子撤销该实例的授权码、应用会话及所有服务 grant；重新启用不恢复旧授权。实例缺失或停用时目录和取票 fail closed。

## 7. 破坏性切换

Who You #92 与 Mobile #406 已合入各自 dev；不再依赖旧应用登记、裸 serviceId 目录或旧狐邮短票。Cloud Auth dev 退役：

- GET /v1/services、POST /v1/services/:serviceId/credential 与 /revoke；
- /v1/application/services 管理接口与 application-enroll/rotate/enable/disable、service-register/revoke 运维命令；
- POST /v1/service-credentials 的旧 Who You read/write/confirmation 及泛 serviceId audience 请求。Relay、Guanlan、Shiyan 的独立签发与 JWKS 不变。
- 不迁移旧 grant；历史表仅保留迁移/历史记录，不参与 V1 授权，不接受旧管理 token，不建立双栈。旧 JWT 不能用于 V1；既有离线凭据按接收端合同及真实 exp 处理。

## 8. 验证与未完成项

已实现并可执行验证：

- contracts：复合身份、catalog 条目、binding request、app claims、响应/错误 shape，以及 V0 裸 serviceId claims 不属于实例契约。
- integration（真实 SQLite + 设备 Cloud Session + HTTP + 真实 EdDSA/JWKS）：
  - 两个 APP_ID 声明同一 `serviceId` 时互不碰撞；
  - 只为已授权实例取票，跨实例/跨账号/错 resource/错 revision/撤权均拒绝；
  - 声明变化后旧 binding 失效、不静默扩 scope，旧 ticket 按真实 exp 过期；
  - 普通登录不创建 grant，V0 裸 serviceId 凭据不能被实例 verifier 接受，实例凭据也不能被 V0 verifier 接受。

联合候选已覆盖真实 SQLite/Fastify OAuth → grant → catalog/credential，普通登录及不同实例隔离、停用与旧 code 撤权。Portal「关联服务」读取当前 V1 目录，支持精确服务撤权和当前可见实例的全部授权解除。旧 V0 路由与 CLI 的负向证据见本仓 integration/contract 测试；OPS-053 继续完成实际 Mobile 消费链及跨仓验收。
