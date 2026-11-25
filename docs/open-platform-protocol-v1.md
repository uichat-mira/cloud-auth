# Mira ID 开放平台：应用接入协议 V1（设计稿）

- 维护方：cloud-auth / Mira ID；2026-11-25。
- 状态：目标产品决策已确认；本文的协议字段与接口是待联验、待确认的设计候选，不是已发布 API。
- 适用：独立部署的应用实例，以及 Mira ID 账号、已登记终端与这些应用之间的身份和授权关系。
- 开发者接入路径见 [开放平台开发指南](open-platform-developer-guide.md)。协议语义以本文为准。
- 现行运行合同仍见 [V0 服务登记](service-registry-v0.md)、[OAuth V0](oauth-authorization-v0.md)、[服务凭据 V0](service-credentials-v0.md)。不要把 V1 示例当作线上能力。

## 1. 产品决策（已确认）

1. 所有 Mira ID 账号拥有者天然是开发者。没有独立开发者资格、资格申请或管理员逐账号预授。既有 Mira ID 账号自身的登录和停用规则不变。
2. 应用项目与部署实例是两件事。共同开发同一项目的人可以各自部署，各自管理业务数据和资源；同一项目不具有全局唯一实例或唯一所有者。
3. 每个部署实例自行生成稳定 APP_ID 与 AppSecret。开发者登录自己的 Mira ID，在「我的应用」输入应用地址和凭据完成登记；Mira ID 从实例发现名称、回调、服务等信息。正常登记不依赖人工运维 CLI、修改静态客户端名单或联动发包。
4. 「我的应用」表示应用实例的管理关系；「关联服务」表示账号的使用授权。两者独立；自己的实例可以同时出现在两个栏目。也可以通过 OAuth 主动登录别人部署的实例，取得使用权，但不获得所有权。
5. 成功主动 OAuth 登录某实例所取得的账号级服务授权，可被该账号下全部已登记、有效且支持相应服务的 Mira 终端消费，无须每个终端配置 AppSecret 或重复登录应用。仅登录 Mira ID 不授予所有实例。
6. MCP 是第一种服务类型，不是开放平台的定义。应用可声明多个服务、不同类型与协议；其他服务类型尚未决定。Mira ID 负责身份、声明、授权与发现，不承担各类服务的业务逻辑。
7. 声明能表达终端适用范围和建议权重。建议权重是消费端的提示，不代表权限或强制 Agent 调用；具体尺度、调度规则暂不决定。

上述决策改变 OPS-049 管理员登记模式及 OPS-050 原方案的目标边界。它们与旧代码不是同一件事。保留历史证据，待新合同获确认后再重定实施任务。Local/Direct/Tailscale、Host Grant、Relay 及各应用业务授权边界不变。

## 2. 角色与身份

| 对象 | 身份与职责 |
| --- | --- |
| Mira ID 账号 | 人的身份；可登记实例、管理自己登记的应用、主动登录其他实例 |
| 应用项目 | 代码/产品标识；用于展示与分组，不参与授权唯一性 |
| 部署实例 | 实例生成 APP_ID 和管理凭据，声明服务；维护自身数据、用户准入和业务权限 |
| 应用所有权 | Mira ID 账号与实例的管理关系，由有效登记证明建立 |
| 服务使用权 | Mira ID 账号与实例服务的授权关系，来自主动登录，而非所有权 |
| Mira 终端 | 账号下已登记的有效安装/运行端，按自身能力消费授权目录 |
| 服务 | 实例内的逻辑资源，具有独立类型、版本、地址、scope 和访问凭据边界 |

目标身份不变量：实例标识与项目名称、软件版本、当前密钥分开；同一 APP_ID 不因软件更新或 AppSecret 轮换而变。一个项目的不同部署不得复用实例标识或密钥。服务逻辑标识在实例内唯一，授权与缓存至少以实例 + 服务为键，绝不只用 projectId 或 serviceId。

候选实现：APP_ID 为实例首次部署时生成并持久保存的高熵随机标识（可使用随机材料的 SHA-256 摘要）；公开标识不等于认证凭据。JWK Thumbprint（RFC 7638/9278）标识公钥，可另用于证明密钥身份，但不宜直接用可轮换公钥的指纹或代码 commit SHA 作为永不变的实例 ID。域名迁移、所有权转移和密钥恢复协议留待专门设计。普通升级保持原标识，独立复制部署生成新标识。

## 3. 登记与发现：候选 HTTP profile

本节是技术候选，目的是提供可以评审的最小协议，而非提前冻结 API 路径、算法或 UI 细节。

### 3.1 发现文档

建议用户输入规范 HTTPS 应用 origin、APP_ID、AppSecret（由应用部署方提供）。Mira ID 从该 origin 的固定发现地址读取 JSON：

```http
GET https://mail-a.example/.well-known/mira-application
Accept: application/json
```

这是 Mira 自定义发现约定，不是 IANA 已注册的通用 well-known suffix，也不是 MCP 元数据或 OAuth CIMD 本身。后者分别遵守各自标准。发现文档公开可读，不携带 AppSecret、私钥、用户数据或可使用的访问凭据。

候选文档示例（字段名、版本表达和路径均待冻结；example 域名仅供说明）：

```json
{
  "schemaVersion": "1",
  "appId": "app-example-instance-a",
  "projectId": "who-you",
  "name": "狐邮",
  "description": "邮件服务",
  "homeUrl": "https://mail-a.example/",
  "iconUrl": "https://mail-a.example/icon.png",
  "manifestRevision": 1,
  "oauth": {
    "clientId": "https://mail-a.example/oauth-client.json",
    "metadataUrl": "https://mail-a.example/oauth-client.json",
    "redirectUris": ["https://mail-a.example/auth/callback"]
  },
  "ownershipVerification": {
    "endpoint": "https://mail-a.example/mira/verify-ownership"
  },
  "services": [
    {
      "serviceId": "mail",
      "name": "邮件服务",
      "description": "检索和阅读邮件",
      "type": "mcp",
      "protocol": {
        "name": "mcp",
        "version": "2025-11-25",
        "endpoint": "https://mail-a.example/mcp"
      },
      "resource": "https://mail-a.example/mcp",
      "scopes": ["mail.read"],
      "targets": ["mobile", "desktop"],
      "hints": {"capabilityDescriptions": ["邮件检索", "邮件阅读"]},
      "extensions": {}
    }
  ]
}
```

- schemaVersion 是 Mira 应用声明协议版本；manifestRevision 是实例声明修订；protocol.version 是对应服务协议的版本，不能混用。MCP 示例版本取自现有狐邮消费合同，不要求以后所有实例使用该版本。
- APP_ID 是 Mira 应用实例身份；OAuth client_id 是 OAuth 客户端身份，两者可以不同，必须由经过验证的登记记录建立唯一绑定。使用 HTTPS client_id URL 是 CIMD 候选，非现行 V0 支持项。
- type 指服务类型；protocol 描述连接协议。类型专属字段放 extensions，由相应消费者理解。MCP 工具名、参数 schema、分页与能力协商以实际协议为准，不把它们复制到 Mira ID。能力描述及建议权重是可选元数据；权重数值范围与调度解释未定，示例不假定尺度。
- targets 只是实例声明的适用环境；消费端按支持的类型、协议版本、授权和本地能力治理取交集。未知类型可以显示元数据，不自动调用、不被当作 MCP。不要为尚未出现的类型规定实现。
- 同一项目的第二个实例具有不同 origin、APP_ID、OAuth client_id、资源地址；服务的 local serviceId 可以相同。

### 3.2 所有权验证

建议登记过程采用以下顺序：

1. Mira ID 已登录账号启动登记，获取发现文档；验证输入 APP_ID 与文档一致，验证 HTTPS origin、回调和端点的关系，预览应用名称、域名、服务。应用自称的名称和图标不能证明它可信。
2. Mira ID 为该登记事务生成一次性、短有效期 challenge，绑定当前账号会话、发现 origin、APP_ID 与声明快照；通过经验证的应用 origin 进行 AppSecret 所有权证明。
3. 候选 profile 为 Mira ID 服务端向同源验证 endpoint 发起 HTTPS POST，提交 APP_ID、challenge、声明摘要及用户提供的 AppSecret（经 TLS，禁止 URL/日志/重定向传播）；应用用自己的管理凭据验证，返回与请求绑定的验证结果。双方应限制重放、失败频率与请求大小，challenge 只能消费一次。精确请求/响应格式与可选签名 challenge 升级待安全设计冻结。
4. Mira ID 只在验证成功后建立账号—实例管理关系，拒绝未经现有所有者授权的重复认领或覆盖。以 verified origin + APP_ID 及 OAuth metadata binding 防止不同域名冒用相同公开 ID。应用自身的管理凭据与 Mira ID 内部管理权限分别维护；不把 AppSecret 下发终端，不在目录、声明或日志中保存明文。候选最小方案仅在登记事务中使用 AppSecret，不长期保留；后续刷新使用已验证 origin 与公开元数据，敏感变更需要重新证明。
5. 登记成功后，实例出现于「我的应用」，Mira ID 可以识别其 OAuth 客户端；仅登记不自动授予服务使用权。已有有效实例的重复登记、共享管理、移除和转移的具体交互待确认，不能用重复登记偷换所有者。

AppSecret 是 Mira 自定义的部署管理凭据，不是必须使用的 OAuth client_secret，也不是用户密码；应用端需安全生成、存储与轮换。公开元数据和管理凭据不混用。可研究私钥签名（RFC 7523/private_key_jwt）作为常规客户端证明；不在本轮决定必须使用某一种密钥算法。

### 3.3 声明验证、刷新与信任

首次与每次敏感变更均验证回调、资源和归属。最小候选 profile 使用 HTTPS、无通配回调、严格 origin 绑定（同源为简单默认，跨源需要可验证的绑定方案，而非永久预授域名名单）。OAuth 请求按已验证的完整 URI 精确匹配，不相信请求方临时给出的回调。

服务端抓取开发者自定义 URL 是新的信任边界：须防止 SSRF/DNS rebinding，限制连接范围、响应大小、时长、并发，拒绝私有/环回/link-local/metadata 地址及未重新验证的跳转；验证最终连接目标，图标、公钥、回调、服务地址同样按用途校验。不把任何凭据附到不相关 origin。这里是工程安全不变量，不是开发者资格审批。

建议采用有界缓存与声明修订，所有权、绑定、授权记录与声明快照分离。正常升级刷新描述；敏感 endpoint、回调、scope 或所有权变化不能静默把旧授权转发到不同资源或提升权限。断网与验证失败分开处理；失败不能伪装成空目录或已验证成功。刷新触发方式、缓存时间、域名迁移和既有授权扩张语义待冻结。

## 4. OAuth 登录与账号使用授权

已确认产品方向为：实例作为应用登录方，Mira ID 作为身份与授权中心。用户访问实例，选择通过 Mira ID 登录，Mira ID 识别已登记的实例并显示其真实域名/声明的授权关系；成功主动登录该实例建立账号级使用授权。其他账号可按应用自身的准入策略使用该实例，不需知道 AppSecret。

候选 OAuth profile：复用授权码 + PKCE S256、state、一次性 code、准确回调、issuer 校验和服务端 token exchange；应用 OAuth client_id 可采用 CIMD URL 或已经验证的显式绑定。CIMD 当前为 IETF 草案，不声明已符合最终标准；也不要求放开未登记实例自动 OAuth。必要的 confidential client 认证可参考 RFC 7523；具体方法与会话响应合同待冻结。

开放应用不是 Mira 原生终端。既有 V0 给受信任第一方客户端的 Cloud Session 不可原样交给任意独立实例：应用只能获得面向自身登录/业务授权的凭据（候选为具备明确 issuer、subject、audience 的应用登录断言；若选择 OIDC，须按其规范另行完成 ID token、nonce 等约束）。应用不能藉此管理账号设备、其他应用或取得通用 Cloud Session。应用仍负责本地会话、业务准入和资源归属。Mira ID 不能用未经校验的应用回调或任意传入 accountId 伪造授权。

候选一致性边界：一次成功的主动登录兑换与对应的授权快照持久化具备幂等性/一致性，失败、重放、登录其他实例、普通会话续期不授予新服务；如实例另有业务准入，则不得把失败的业务准入解释为已获可用服务。具体应用准入反馈与 OAuth token 类型、scope 扩张及确认流程，须在编码前决定。

普通退出应用会话与主动解除服务授权不是一回事。继承现有撤权基本语义：撤权停止新凭据签发，短期离线凭据直到有效期结束仍可能有效；明确重登可重新取得合法授权。解除关联、应用停用与所有权移除的完整状态机待确认。

## 5. 终端发现与服务消费

逻辑流程：

```text
Mira 终端 -> Mira ID: 有效账号/终端会话，读取授权目录
Mira ID -> 终端: 实例身份 + 已授权服务描述 + 修订
终端 -> Mira ID: 请求指定实例/服务的短期访问凭据
Mira ID -> 终端: 仅对该资源与授权范围有效的凭据
终端 -> 实例服务: 按其协议直接访问
```

建议复用现有 GET /v1/services 和凭据签发的概念，而不是把现有路径/响应直接宣称为 V1。候选新目录至少含实例 APP_ID、projectId、serviceId、类型、资源/端点、scope、适用终端、声明/授权修订；凭据请求至少绑定实例、服务、修订，账号及终端身份由认证上下文得出。精确 API 路径、兼容方式和 token 格式待冻结。

资源隔离优先参考 RFC 8707 与 RFC 9728。应用 A 与 B 即使同名同项目，凭据也不能互相使用；服务应验证可信 issuer、签名或认可的 introspection、精确 audience/resource、有效期、scope 及业务 subject，不接受仅凭 projectId 或全局 whoyou.read 推断实例授权。短期访问凭据的受众、实例和资源映射必须唯一，避免同源多个资源间混用；终端不可直接使用 AppSecret 或将原始 Cloud Session 传给服务。缓存绑定账号、终端、实例、服务、资源、声明/授权修订和有效期，变化时重新发现，不因缓存继续扩大权限。

MCP profile：使用与已实现消费者兼容的 MCP HTTP transport、初始化/版本协商、RFC 9728 resource metadata、工具发现与权限校验；实际工具通过 tools/list（含分页/变化通知）获得，工具执行仍经过 Mira 自身治理、必要用户确认及服务端业务校验。MCP 资源、提示词等特性按协议能力处理，不定义成所有服务的必备字段。其他类型只在真实需求出现时另定 profile。

## 6. 参考标准与边界

核对日期：2026-11-25。以下是一手规范与实现参考，不表示 Mira 已经符合全部标准。

| 来源 | 借鉴范围 |
| --- | --- |
| [IETF OAuth CIMD draft-03](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03) | HTTPS client_id 自描述、元数据获取与精确绑定、预登记可选、SSRF；仍为草案；不包含 Mira 所有权 AppSecret |
| [AT Protocol OAuth](https://atproto.com/specs/oauth) | 独立部署与 URL 客户端元数据的实践；不照搬其完整身份系统 |
| [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html)、[RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html)、[RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) | OAuth 授权码、PKCE、安全最佳实践；非新业务授权模型 |
| [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html)、[RFC 9728](https://www.rfc-editor.org/rfc/rfc9728.html)、[RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html) | 授权服务器/受保护资源发现与资源级访问凭据 |
| [RFC 7638](https://www.rfc-editor.org/rfc/rfc7638.html)、[RFC 7523](https://www.rfc-editor.org/rfc/rfc7523.html) | 公钥指纹与 JWT 证明；与实例身份、管理凭据分离 |
| [MCP authorization (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)、[tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools)、[MCP Registry](https://registry.modelcontextprotocol.io/) | 首种服务 profile 的发现、连接与工具；不是 Mira 通用应用登记协议 |

Mira 自定义部分：应用实例所有权登记、跨实例账号使用授权、账号向有效终端传播授权目录、通用多类型声明、端适用性及 Agent 建议权重。OAuth 认证不是自动信任应用内容或自动批准工具执行；外部应用不得读取超出其资源范围的账号数据。

## 7. 实施前的未决问题与验收证据

本文没有裁定以下产品/信任取舍：应用对其他账号的开放/邀请准入；共同所有者与转移、移除、恢复；声明新增服务/扩大 scope 是否需要重新授权与其交互；是否支持跨域托管、域名迁移；精确客户端认证方法、登录票据与凭据 API、权重范围；服务端错误/缓存和密钥生命周期。具体发现技术可在不改变产品目标的前提下完善；未确认的产品策略不能由施工自行变成资格审核、全局保留项目或固定域名制度。

验证应覆盖：两个独立部署同项目同 serviceId，不同 APP_ID/资源/密钥；任意有效账号可登记自己的实例；错误凭据、重放、跨账号抢占、伪造来源或回调失败；其他账号主动登录对方实例，仅关联不成为所有者；同账号两台有效终端无需重复应用授权，分别拿到实例限定凭据；未知服务类型不被当作 MCP；撤权、错误实例票据、声明变更不越权；现有第一方登录与本地路径不破坏。应使用真实运行链路与隔离实例验证，非仅 UI、mock 或 CI。

## 8. 迁移边界

- 现行 dev V0 的 OAuth client ID 及 project/service 唯一约束、管理员 enrollment、managementToken 和服务凭据不能直接表达本协议的多实例目标。OPS-049 已有授权码、签发、目录、修订及撤权底座可评估复用，不能宣称兼容 V1。
- OPS-050 #208 与 Draft PR #209 的旧方案是 Mira ID 签发应用凭据并预授资格，与第 1 节冲突，保留历史候选，不继续按其旧合同施工。新的实施合同与迁移步骤在协议评审后确定。
- 狐邮（OPS-048 #83）、Mobile（MOB-105 #392）和既有 V0 使用者仍依其现行合同，不因本文自动切换、重发或启用生产声明。验证后再做兼容/迁移，不为适配 V1 擅自扩大业务权限或删除旧链路。
- 不在本次文档工作中决定数据库结构、立即删除旧接口或操作生产账号/密钥；不设公共插件市场或另建通用业务代理。
