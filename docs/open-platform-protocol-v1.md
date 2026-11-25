# Mira ID 开放平台：应用接入协议 V1（设计稿）

- 维护方：cloud-auth / Mira ID；2026-11-25。
- 状态：目标产品决策已确认。OPS-050 已实现 §3 的最小实例登记子集（HTTPS Origin + APP_ID + AppSecret、固定发现文档、登记验证与 ownership）；OPS-052 已实现实例级目录、复合身份、服务粒度撤权与短期凭据子集（见 [实例级服务目录与短期凭据 V1](open-platform-service-credentials-v1.md)）。§4 的开放应用 OAuth 与账号 grant 写入权威仍由 OPS-051 实现；在 OPS-051 合并并以 dev 真实联验前，不能把部分落地误写成整个平台已发布。
- 适用：独立部署的应用实例，以及 Mira ID 账号、已登记终端与这些应用之间的身份和授权关系。
- 开发者接入路径见 [开放平台开发指南](open-platform-developer-guide.md)。协议语义以本文为准。
- 现行运行合同仍见 [V0 服务登记](service-registry-v0.md)、[OAuth V0](oauth-authorization-v0.md)、[服务凭据 V0](service-credentials-v0.md)。不要把 V1 示例当作线上能力。

## 1. 产品决策（已确认）

1. 所有 Mira ID 账号拥有者天然是开发者。没有独立开发者资格、资格申请或管理员逐账号预授。既有 Mira ID 账号自身的登录和停用规则不变。
2. 应用项目与部署实例是两件事。共同开发同一项目的人可以各自部署，各自管理业务数据和资源；同一项目不具有全局唯一实例或唯一所有者。
3. 每个部署实例自行生成稳定 APP_ID 与 AppSecret。开发者登录自己的 Mira ID，在「我的应用」输入规范 HTTPS Origin、APP_ID 与 AppSecret 完成登记；Origin 只用于定位实例，APP_ID 是稳定实例身份，AppSecret 用于受保护的登记验证。Mira ID 从该 Origin 自动读取名称、回调、服务等元信息；callback、serviceId、scope、resource、MCP endpoint 不由用户手工填写。正常登记不依赖人工运维 CLI、修改静态客户端名单或联动发包。
4. 「我的应用」表示应用实例的管理关系；「关联服务」表示账号的使用授权。两者独立；自己的实例可以同时出现在两个栏目。也可以通过 OAuth 主动登录别人部署的实例，取得使用权，但不获得所有权。
5. 成功主动 OAuth 登录某实例所取得的账号级服务授权，可被该账号下全部已登记、有效且支持相应服务的 Mira 终端消费，无须每个终端配置 AppSecret 或重复登录应用。仅登录 Mira ID 不授予所有实例。
6. MCP 是现阶段重点接入的第一种服务类型，不是开放平台的定义。子应用提供完整、符合最新稳定官方规范的标准 MCP 服务，Mira 终端使用标准 MCP Client。开放平台包含 MCP，不定义 Mira 版 MCP，不裁剪或修改协议，不要求私有 MCP 字段或协商。应用可声明多个服务、不同类型与协议；其他服务类型保留扩展空间，暂不设计。Mira ID 负责身份、声明、授权与发现，不承担各类服务的业务逻辑。
7. Mira 外层应用服务声明可表达终端适用范围、能力分组、标准工具引用及非授权性质的治理提示，不是 MCP 私有协议字段。工具引用的规范身份为 `(APP_ID, serviceId, MCP tool name)`；声明只引用标准 `tools/list` 中真实存在的工具，不复制 Tool Schema。风险治理采用多维 `riskHints`，不定义 R0–R4 等单轴等级；`selectionWeightHint` 仅在已合法进入候选集的工具/能力之间提供相对排序建议。所有提示均不得授予权限、降低客户端既有安全门槛或强制 Agent 调用。

上述决策改变 OPS-049 管理员登记模式及 OPS-050 原方案的目标边界。V1 由当前 OPS-050/051/052、OPS-048、MOB-105/107 与 AGT-073 等工作项按破坏性切换实施：不承诺 V0 双读、双写、alias、旧协议 fallback 或长期兼容层。V0 文档仍描述切换前的实际运行事实；消费者完成迁移后，旧入口应删除并留下负向验证。Local/Direct/Tailscale、Host Grant、Relay 及各应用业务授权边界不变。

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

## 3. 登记与发现：V1 HTTP profile（OPS-050 已实现最小子集）

OPS-050 已冻结并实现本节的最小同源登记链路：用户提交 HTTPS Origin、APP_ID 与 AppSecret；Mira ID 从 `/.well-known/mira-application` 读取声明，并调用声明中的同源 `registrationVerification.endpoint` 完成管理凭据验证。跨源托管、域名迁移、共同所有权与其他扩展仍未冻结，不得从当前实现自行外推。

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
  "registrationVerification": {
    "endpoint": "https://mail-a.example/mira/verify-registration"
  },
  "services": [
    {
      "serviceId": "mail",
      "name": "邮件服务",
      "description": "检索和阅读邮件",
      "type": "mcp",
      "protocol": {
        "name": "mcp",
        "version": "2026-07-28",
        "endpoint": "https://mail-a.example/mcp"
      },
      "resource": "https://mail-a.example/mcp",
      "scopes": ["mail.read"],
      "targets": ["mobile", "desktop"],
      "capabilities": [
        {
          "id": "mail.read",
          "title": "邮件读取",
          "description": "搜索并读取当前账号已授权邮件",
          "toolRefs": ["mail.search", "mail.get_message"],
          "selectionWeightHint": 0.8
        }
      ],
      "toolGovernance": [
        {
          "toolRef": "mail.search",
          "riskHints": ["sensitive-data-read"],
          "confirmationHint": "recommended"
        }
      ],
      "extensions": {}
    }
  ]
}
```

- schemaVersion 是 Mira 应用声明协议版本；manifestRevision 是实例声明修订；protocol.version 是对应服务协议的版本，不能混用。MCP 示例采用截至 2026-11-25 的最新稳定官方版本 2026-07-28；新接入随官方稳定版本演进，既有 2025-11-25 消费链路仅属迁移兼容，不是新接入目标。
- APP_ID 是 Mira 应用实例身份；OAuth client_id 是 OAuth 客户端身份，两者可以不同，必须由经过验证的登记记录建立唯一绑定。使用 HTTPS client_id URL 是 CIMD 候选，非现行 V0 支持项。
- type 指服务类型；protocol 描述标准连接协议。`capabilities`、`toolGovernance`、`extensions` 是 Mira 外层声明字段，与 MCP 官方 capabilities.extensions、_meta 无关，不注入或改写 MCP 消息。服务内 `toolRefs` / `toolRef` 的值必须精确匹配该服务标准 `tools/list` 返回的 MCP tool name；其规范身份由外层上下文解析为 `(APP_ID, serviceId, MCP tool name)`。工具参数 schema、annotations、分页与能力发现以标准协议及服务实际响应为准，不在 Mira ID 复制 Tool Schema。外层治理信息见 §5.2。
- targets 只是实例声明的适用环境；消费端按支持的类型、协议版本、授权和本地能力治理取交集。未知类型可以显示元数据，不自动调用、不被当作 MCP。不要为尚未出现的类型规定实现。
- 同一项目的第二个实例具有不同 origin、APP_ID、OAuth client_id、资源地址；服务的 local serviceId 可以相同。

### 3.2 登记验证

V1 采用最小登记流程，不引入 challenge、公私钥所有权协议或额外人工字段：

1. 已登录 Mira ID 的开发者提交规范 HTTPS Origin、APP_ID 与 AppSecret。
2. Mira ID 服务端从该 Origin 的固定发现地址读取公开元信息，验证发现文档中的 APP_ID 与输入一致，并校验 Origin、OAuth 回调、服务 endpoint/resource 等关系。应用名称和图标只用于展示，不能证明身份。
3. Mira ID 服务端向发现文档声明的同源登记验证 endpoint 发起 HTTPS POST，提交 APP_ID 与用户提供的 AppSecret。应用服务端验证这组管理凭据后只返回有界成功/失败结果。AppSecret 不进入 URL、重定向、日志、公开声明、模型上下文或终端；验证接口应限制失败频率、请求大小和滥用。
4. Mira ID 仅在验证成功后建立账号—实例 ownership，并保存 verified Origin、APP_ID 与必要的声明快照。默认登记流程不要求长期保存 AppSecret 明文；公开元信息可从 verified Origin 刷新，涉及 ownership、敏感 endpoint 或密钥变更时可要求重新输入管理凭据。
5. 登记成功后实例出现在「我的应用」；登记本身不授予服务使用权。已有有效实例的重复登记、共享管理、移除和转移不能通过重复提交凭据偷换所有者。

AppSecret 是 Mira 自定义的部署管理凭据，不是用户密码，也**不默认等同于 OAuth client_secret**。OAuth client identity 与 confidential-client authentication 由已验证登记记录和 §4 的独立合同决定，不能因为登记阶段存在 AppSecret 就自动复用它。

### 3.3 声明验证、刷新与信任

首次与每次敏感变更均验证回调、资源和归属。最小候选 profile 使用 HTTPS、无通配回调、严格 origin 绑定（同源为简单默认，跨源需要可验证的绑定方案，而非永久预授域名名单）。OAuth 请求按已验证的完整 URI 精确匹配，不相信请求方临时给出的回调。

服务端抓取开发者自定义 URL 是新的信任边界：须防止 SSRF/DNS rebinding，限制连接范围、响应大小、时长、并发，拒绝私有/环回/link-local/metadata 地址及未重新验证的跳转；验证最终连接目标，图标、公钥、回调、服务地址同样按用途校验。不把任何凭据附到不相关 origin。这里是工程安全不变量，不是开发者资格审批。

建议采用有界缓存与声明修订，所有权、绑定、授权记录与声明快照分离。正常升级刷新描述；敏感 endpoint、回调、scope 或所有权变化不能静默把旧授权转发到不同资源或提升权限。断网与验证失败分开处理；失败不能伪装成空目录或已验证成功。刷新触发方式、缓存时间、域名迁移和既有授权扩张语义待冻结。

## 4. OAuth 登录与账号使用授权

OPS-051 冻结开放应用登录为**已登记的公开 OAuth 客户端 + 授权码 + PKCE S256**。客户端标识从已验证的实例声明绑定到 APP_ID，支持同源 HTTPS URL 或合法的不透明标识；不做未经登记的 CIMD 自动发现，不复用登记 AppSecret 作为 client_secret，不提供 OIDC ID token 或通用 Cloud Session。

完整 HTTP 请求、响应、会话生命周期与负向边界由 [开放应用 OAuth V1](application-oauth-v1.md) 统一定义；服务授权目录、复合身份和短期服务凭据由 [实例级服务凭据 V1](open-platform-service-credentials-v1.md) 定义。

成功主动登录的兑换事务同时消费一次性 code、写入同一份实例级服务授权台账并创建应用专属会话；应用只能取得用于自身身份登录的短期凭据，不得用它访问原生 Cloud Session API。应用自己的业务准入、资源归属及业务会话仍由应用负责。用户退出应用与撤销服务授权不同。

## 5. 终端发现与服务消费

逻辑流程：

```text
Mira 终端 -> Mira ID: 有效账号/终端会话，读取授权目录
Mira ID -> 终端: 实例身份 + 已授权服务描述 + 修订
终端 -> Mira ID: 请求指定实例/服务的短期访问凭据
Mira ID -> 终端: 仅对该资源与授权范围有效的凭据
终端 -> 实例服务: 按其协议直接访问
```

建议复用现有目录与短期签发的内部能力，而不是把 V0 路径/响应直接宣称为 V1。候选新目录至少含实例 APP_ID、projectId、serviceId、类型、资源/端点、scope、适用终端、声明/授权修订；凭据请求至少绑定实例、服务、resource 与修订，账号及终端身份由认证上下文得出。V1 API 路径和 token 格式以实例级服务凭据 V1 合同为准；对外合同按破坏性切换实施，不把旧裸 serviceId 路径包装成长期兼容接口。

OPS-052 已冻结并实现其独立子集：目录为 `GET /v1/application-services`，取票与撤权为 `POST /v1/application-services/{appId}/{serviceId}/credential|revoke`；凭据 claims 绑定 `iss/sub/device_id/aud(=resource)/app_id/service_id/resource/scope/exp`。账号 grant 的写入权威、应用停用状态机与真实 OAuth 联验仍按 OPS-051 对齐；详细契约、错误和切换顺序见 [实例级服务目录与短期凭据 V1](open-platform-service-credentials-v1.md)。

资源隔离优先参考 RFC 8707 与 RFC 9728。应用 A 与 B 即使同名同项目，凭据也不能互相使用；服务应验证可信 issuer、签名或认可的 introspection、精确 audience/resource、有效期、scope 及业务 subject，不接受仅凭 projectId 或全局 whoyou.read 推断实例授权。短期访问凭据的受众、实例和资源映射必须唯一，避免同源多个资源间混用；终端不可直接使用 AppSecret 或将原始 Cloud Session 传给服务。缓存绑定账号、终端、实例、服务、资源、声明/授权修订和有效期，变化时重新发现，不因缓存继续扩大权限。

### 5.1 标准 MCP：现阶段接入重点

MCP 是完整独立的官方协议，不是 Mira 自定义传输或子集。新应用和 Mira 消费端以 [最新稳定 MCP 规范](https://modelcontextprotocol.io/specification/latest) 为准（2026-11-25 核对：2026-07-28）。满足全部适用的规范要求；官方可选能力及扩展按实际支持情况声明，依官方协商规则使用，不假装支持未实现的能力。

- 应用发现：Mira ID 读取外层应用声明，识别实例、资源、授权关系与端点。
- 服务发现：标准 MCP Client 直接访问该实例的 MCP endpoint；受保护 HTTP 服务遵守官方 MCP Authorization、RFC 9728 资源及授权服务器发现、标准授权服务器元数据、客户端身份和资源绑定等要求。Mira ID 作为授权中心必须兼容这些要求；既有账号级授权可以简化凭据获取，但不能替代或破坏标准授权协议。
- 能力发现：2026-07-28 使用无状态、逐请求版本与能力元数据，服务端实现标准 server/discover；不以旧版 initialize 握手为新协议前置条件。通过标准 tools/list、tools/call 消费工具，遵守适用的分页、缓存、变化通知、JSON Schema、错误语义和传输要求；resources、prompts、官方可选扩展按官方规范和实际支持能力使用。
- 标准互操作：非 Mira 标准 MCP Client 在满足标准认证及业务授权前提下，可以直接使用该服务，不需要理解 Mira 应用声明、私有工具字段或私有能力协商；Mira Client 同样不要求 MCP 服务修改 wire protocol。

既有 2025-11-25/2025-06-18 实现只作为迁移来源，不是 V1 兼容目标。当前实施合同要求 Mobile 与 Desktop 直接切到 2026-07-28，不保留 initialize/initialized、旧版本协商或失败后降级；Who-You 同样以 2026-07-28 作为纵切目标。具体 SDK 与跨仓实现仍需验证；本文不宣称当前代码已经符合最新版本。

### 5.2 Mira 外层服务声明与治理信息

Mira 扩展应用/服务的描述维度，而不是 MCP 协议。Mira ID 目录识别实例、服务与授权；实际工具、Tool Schema 与标准 annotations 始终由 MCP Server 的标准协议响应提供。Mira 消费端可将外层声明与实际能力关联，用于环境 → 能力 → 工具三层披露及本地治理。

#### 工具引用：只引用，不复制

Mira 外层工具的规范身份固定为三元组：

```text
(APP_ID, serviceId, MCP tool name)
```

在单个服务声明内部，`toolRefs[]` 与 `toolGovernance[].toolRef` 只写 MCP tool name；`APP_ID` 与 `serviceId` 从所属应用/服务上下文继承。tool name 必须与标准 `tools/list` 返回值精确、区分大小写地匹配，不允许通配、别名或按描述猜测。

- 能力分组只维护 tool name 的引用关系，不复制 description、inputSchema、outputSchema、ToolAnnotations 或调用语义。
- 引用在当前 `tools/list` 中不存在时，该引用为 unresolved；客户端不得凭外层声明伪造一个工具。
- `tools/list` 出现尚未分组的新工具时，工具仍可作为“未分组工具”参与标准发现；不得因为 Mira 外层分组缺失而吞掉一个本来合法、已授权、客户端支持的 MCP Tool。
- 工具改名视为新的规范身份；旧引用保持 unresolved，直到发布者更新声明。manifestRevision 可用于缓存失效，但不能改变工具身份语义。

#### 多维治理提示：只允许增加上下文，不允许降低安全性

Mira V1 不定义 R0–R4、Low/Medium/High 等单轴风险等级。外层 `toolGovernance[].riskHints` 是可选的、可累加的风险维度列表；V1 固定值为：

| riskHint | 含义 |
| --- | --- |
| `sensitive-data-read` | 可能读取个人、机密或其他敏感数据 |
| `external-side-effect` | 可能向外部系统写入、发送、发布或改变外部状态 |
| `irreversible` | 操作结果可能无法可靠撤销或回滚 |
| `credential-use` | 调用会使用账号、密钥、令牌或其他受保护凭据访问外部资源 |
| `code-execution` | 会执行代码、脚本、命令或等价可执行内容 |
| `financial-action` | 会产生付款、下单、转账、计费、合约或其他财务承诺 |

风险列表只表达“发布者认为此风险维度存在”。**缺失某个值不等于风险不存在**，V1 不提供 `false` 或“低风险”声明来降低客户端安全判断。未知 riskHint 必须忽略其语义但保留原始值供诊断，不得因此自动放行。

`confirmationHint` V1 仅允许值 `recommended`，表示发布者建议在实际执行前获取用户确认；字段缺失不表示“不需要确认”。客户端始终可以依据本地策略要求更强确认。

标准 MCP ToolAnnotations（如 readOnlyHint、destructiveHint、idempotentHint、openWorldHint）按官方定义原样使用。Mira riskHints 不替代、不覆盖它们，两者都只是行为/风险提示而非授权证明。只读也可能是高敏感读取；标注可逆也不能证明当前参数一定安全。

#### 建议权重：只在已经合法的候选集里排序

`selectionWeightHint` 是可选的 0 到 1 数值，表示发布者对能力/工具被 Agent 优先考虑的相对建议。它只在**同一服务的同一 manifestRevision** 内有比较意义；跨应用、跨服务不建立全局排名。客户端可以归一化、忽略或被本地策略覆盖。

权重不能使一个未授权、未披露、客户端不支持或被本地政策拒绝的工具进入候选集，也不能跳过确认。没有权重时不得假设默认高优先级。

#### Runtime 最终决策

Mira Runtime 的实际调用判断至少综合：账号/OAuth 与业务权限、服务端实际可用性、标准 MCP ToolAnnotations、Mira riskHints、当前调用参数与上下文、以及本地用户/设备策略。外层治理声明只能提供上下文，不能扩大权限。

因此，标准 MCP Client 在合法授权下仍可完全不理解 Mira 声明而正常互操作；Mira Client 也不得要求服务修改 MCP wire protocol。其他服务类型未来可定义自己的工具/操作引用 profile，但不得把本节的 MCP toolRef 规则冒充成通用协议。

## 6. 参考标准与边界

核对日期：2026-11-25。以下是一手规范与实现参考，不表示 Mira 已经符合全部标准。

| 来源 | 借鉴范围 |
| --- | --- |
| [IETF OAuth CIMD draft-03](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-client-id-metadata-document-03) | HTTPS client_id 自描述、元数据获取与精确绑定、预登记可选、SSRF；仍为草案；不包含 Mira 所有权 AppSecret |
| [AT Protocol OAuth](https://atproto.com/specs/oauth) | 独立部署与 URL 客户端元数据的实践；不照搬其完整身份系统 |
| [RFC 6749](https://www.rfc-editor.org/rfc/rfc6749.html)、[RFC 7636](https://www.rfc-editor.org/rfc/rfc7636.html)、[RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html) | OAuth 授权码、PKCE、安全最佳实践；非新业务授权模型 |
| [RFC 8414](https://www.rfc-editor.org/rfc/rfc8414.html)、[RFC 9728](https://www.rfc-editor.org/rfc/rfc9728.html)、[RFC 8707](https://www.rfc-editor.org/rfc/rfc8707.html) | 授权服务器/受保护资源发现与资源级访问凭据 |
| [RFC 7638](https://www.rfc-editor.org/rfc/rfc7638.html)、[RFC 7523](https://www.rfc-editor.org/rfc/rfc7523.html) | 公钥指纹与 JWT 证明；与实例身份、管理凭据分离 |
| [MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28)、[版本与兼容性](https://modelcontextprotocol.io/specification/2026-07-28/basic/versioning)、[Authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)、[Tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)、[MCP Registry](https://registry.modelcontextprotocol.io/) | 首种服务的完整标准协议；外层应用登记不属于 MCP 规范 |
| [MCP 官方 Tool Annotations 风险研究](https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/) | 区分行为提示、风险信息与授权；研究文章不等于规范，Mira 治理声明不改变 MCP |

Mira 自定义部分：应用实例所有权登记、跨实例账号使用授权、账号向有效终端传播授权目录、通用多类型声明、端适用性及 Agent 建议权重。OAuth 认证不是自动信任应用内容或自动批准工具执行；外部应用不得读取超出其资源范围的账号数据。

## 7. 实施前的未决问题与验收证据

本文没有裁定以下产品/信任取舍：应用对其他账号的开放/邀请准入；共同所有者与转移、移除、恢复；声明新增服务/扩大 scope 是否需要重新授权与其交互；是否支持跨域托管、域名迁移；服务端错误/缓存和密钥生命周期。工具引用、多维治理提示与建议权重的 V1 语义已在 §5.2 冻结；具体客户端如何把这些提示映射为 UI、审批强度或 Agent 调度策略属于消费端本地策略，不由开放平台声明强制。具体发现技术可在不改变产品目标的前提下完善；未确认的产品策略不能由施工自行变成资格审核、全局保留项目或固定域名制度。

验证应覆盖：两个独立部署同项目同 serviceId，不同 APP_ID/资源/密钥；任意有效账号可登记自己的实例；错误凭据、重放、跨账号抢占、伪造来源或回调失败；其他账号主动登录对方实例，仅关联不成为所有者；同账号两台有效终端无需重复应用授权，分别拿到实例限定凭据；未知服务类型不被当作 MCP；撤权、错误实例票据、声明变更不越权；现有第一方登录与本地路径不破坏。另须验证非 Mira 标准 MCP Client 在合法授权下直连服务，Mira Client 按最新官方协议发现及调用，缺少外层治理声明仍保持标准互操作且不绕过本地治理。应使用真实运行链路与隔离实例验证，非仅 UI、mock 或 CI。

## 8. 迁移边界

- 现行 dev V0 的 OAuth client ID、project/service 唯一约束、管理员 enrollment、managementToken、Cloud Session→开放应用以及裸 serviceId 服务凭据不能表达 V1 多实例目标。已有授权码、签发、目录、修订与撤权内部能力可按实际代码复用，但**V0 对外合同不作为兼容目标**。
- OPS-050 #208 的旧“由 Mira ID 创建/签发应用凭据与开发者资格”方案及 Draft PR #209 已被当前合同取代，不得继续作为可合并候选。当前登记输入固定为 HTTPS Origin + APP_ID + AppSecret，其余 callback/service/scope/resource 元信息自动读取。
- OPS-048 #83、MOB-105 #392、MOB-107、AGT-073 及 OPS-051/052 按 breaking cutover 实施：不建立双读、双写、alias、legacy adapter、旧 MCP 握手或静默 fallback。真实消费者迁移完成后直接删除旧入口，并用负向测试证明旧路径不能重新进入成功链路。
- V0 文档在代码切换前继续描述当前运行事实，不为“看起来统一”提前改写成 V1。生产账号、密钥、真实数据和发布仍由各自授权与发布任务控制。
