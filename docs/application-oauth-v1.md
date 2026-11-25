# Mira ID 开放应用 OAuth V1

OPS-051 / OPS-052 联合候选的登录合同；生产接入须等待真实消费端切换及 OPS-053 验收。

## 客户端身份

应用登记由 OPS-050 管理。OAuth client_id 是已验证实例 manifest 中唯一绑定的客户端标识，允许同源 HTTPS URL（不触发额外网络发现）或合法不透明标识，不使用未登记的动态 client_id。回调必须与已登记 HTTPS URI 精确匹配，不允许 query、fragment、通配。原生 mira-desktop、mira-mobile 与已退休 who-you-web 保留字不得被实例抢占。

V1 使用 OAuth 授权码 + PKCE S256 的公开客户端模式，不要求独立 confidential-client secret，也不接受 client_secret 或登记 AppSecret。应用必须在自己的可信服务端管理 verifier/state，严格验证回调 state，通过受信 Mira ID HTTPS origin 兑换。此合同不是 OIDC，不签发 ID token。

## 登录

1. 浏览器 GET /v1/oauth/authorize，字段 response_type=code、client_id、redirect_uri、state、code_challenge、code_challenge_method=S256。
2. Mira ID 展示应用名称、验证域名、将关联的服务及 scope，用户通过 Mira ID 的密码/CSRF 表单主动确认；声明 revision 在授权确认及兑换时均复核。
3. 成功返回 code/state 到已验证的完整回调。应用服务端提交 POST /v1/oauth/token，标准 application/x-www-form-urlencoded 或严格 JSON，仅包含 grant_type=authorization_code、client_id、redirect_uri、code、code_verifier。不得提交 installation_id、platform、client_secret 或额外字段。
4. 响应 applicationOAuthTokenResponseSchema：access_token（独立 opaque mas_v1 token）、token_type=Bearer、expires_in（最长 3600 秒）、expiresAt（ISO）、issuer=mira:cloud-auth、subject（Mira 账号 ID）、audience（精确 client_id）、appId（APP_ID）。凭据仅保存 digest，不生成原生设备或 Cloud Session。应用须同时验证 issuer、audience、appId、expiry，不得将其它应用的凭据当作自己的身份。

一次成功兑换在 SQLite 同一 writer transaction 内校验并消费一次性 code、调用 ApplicationServiceRepository.establishLoginGrants、创建应用会话。任一写入失败全部回滚。服务授权只有 application_service_grants 一份台账；普通 Mira ID 登录、其它应用登录、会话查询、续期不授予服务。会话是身份凭据，不替代邮件等业务资源的实际授权。

## 会话和授权生命周期

- GET /v1/oauth/application-session：以应用 access_token 作为 Bearer 获取 issuer、subject、audience、appId、expiresAt；服务端核对当前账号、应用启用状态、声明 revision、凭据 digest 和有效期。不返回 Cloud Session 或其它资源权限。
- POST /v1/oauth/application-session/logout：应用凭据，204；仅撤销该应用会话，保留用户主动授予的服务权限。应用须自行退出本地业务会话。
- POST /v1/account/application-authorizations/:appId/revoke：账号 Cloud Session，204；撤销当前账号对该实例的全部服务 grant、应用会话及已签发未消费的 code，不能影响其它账号/实例。之后须主动重新登录。
- POST /v1/account/applications/:appId/status：所有者账号 Cloud Session，JSON {"disabled":true/false}，204。停用撤销该实例所有账号的 grant、会话、待兑换 code；启用不恢复。我的应用提供相应操作。移除 ownership 不等于停用或主动撤销用户授权。
- 服务粒度撤权保留其余服务，但使该账号对该实例此前尚未消费的 code 失效，避免旧 code 恢复撤销的服务。密码变更/重置撤销应用会话及待兑换 code；账号停用/拒绝准入亦撤销服务 grant。
- manifestRevision 发生变化时当前候选采用保守重新授权策略：旧 code、应用会话、服务 grant 均失效，即使后续恢复原服务声明也不自动恢复。登记 AppSecret 轮换不使 OAuth 凭据变成管理凭据；只有再次验证登记凭据才能更新登记元信息。
- 应用不得把本地业务 cookie 视为永久 Mira ID 授权；受保护业务操作应复核应用会话有效性。已签发的独立服务离线票据按其 exp 自然到期，不宣称瞬时撤销。

## 破坏性切换

原生 Desktop/Mobile OAuth 仅原生客户端可取得原生 Cloud Session。旧 who-you-web 和 trusted application 的 OAuth admission 已关闭；迁移 015 撤销历史非原生 OAuth 签发的 Cloud Session 及尚未兑换的旧 code。原生和直接账号会话不受影响。旧 registry/management 仍有真实狐邮/Mobile 消费者，按 OPS-048/MOB-105 切换后删除，V1 无读写桥接、fallback、alias；上线前须确认消费者已迁移。

验证以隔离 SQLite、Fastify HTTP 表单/兑换/目录/取票、实际签名、撤权及失败事务为依据。登记远端 HTTP 在测试中由受控 fixture 代替，真实公网实例与终端联合验收属于 OPS-053。
