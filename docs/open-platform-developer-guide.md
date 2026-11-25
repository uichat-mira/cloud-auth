# Mira ID 开放平台开发指南（V1 预览）

> 本指南描述已实现的 dev V1 接入合同。规范唯一来源：[应用接入协议 V1](open-platform-protocol-v1.md)。旧开放应用 V0 已在 dev 退役，不提供兼容层；本指南不代表生产已发布。

## 你可以做什么

任何 Mira ID 账号拥有者都可以开发应用并登记自己的部署实例。应用可以是你自己开发的，也可以是独立部署的同一个开源项目。你保有服务器、资源和业务数据；Mira ID 提供共同的身份、所有权登记、账号授权及终端服务发现。

Mira ID 并非 MCP 服务托管商、应用商店或业务代理。MCP 是当前重点接入的首种服务类型。应用提供的是符合最新稳定官方规范的标准 MCP Server，不是 Mira 版 MCP Server；开放平台在外层包含它。开发者不必将未来其他类型的应用包装成 MCP Server。

## 1. 部署你的应用

例如你和另一位开发者共同开发狐邮，两人分别部署：

| 项目 | 实例 A | 实例 B |
| --- | --- | --- |
| 应用项目 | who-you | who-you |
| 部署地址（示意） | https://mail-a.example | https://mail-b.example |
| APP_ID | 实例 A 自己生成 | 实例 B 自己生成 |
| AppSecret | A 的秘密管理环境 | B 的秘密管理环境 |
| 数据、授权与资源 | A 独立维护 | B 独立维护 |

CF Workers 只是一个部署选项，普通自建服务器同样适用。每个实例首次部署时生成并保存自己的身份和管理凭据；升级保留身份，复制为另一个实例时重新生成。不要把生产密钥写入项目源码、镜像、共享部署模板或提交到 Git。

## 2. 让应用能够自我描述

应用提供公开的机器可读发现文档 `/.well-known/mira-application`。这是 OPS-050 已实现的 V1 最小登记入口；完整字段、JSON 示例及校验语义见 [协议 §3](open-platform-protocol-v1.md#3-登记与发现v1-http-profileops-050-已实现最小子集)。

开发者准备：

- 实例 APP_ID、项目标识、应用名称、描述、首页与图标；
- 已验证的 OAuth client_id 与真实 HTTPS 回调地址（同源 URL 或合法不透明 client_id；非自动 CIMD 接入）；
- 登记验证端点：Mira ID 服务端通过 HTTPS 提交 APP_ID + AppSecret，实例验证成功/失败；不要求 challenge、公私钥证明或额外人工字段；
- 一个或多个服务描述：类型、协议版本、实际连接地址、资源标识、授权范围、适用终端；可提供能力分组、标准 MCP tool name 引用、0–1 的 `selectionWeightHint`，以及多维 `riskHints` / `confirmationHint` 等外层治理提示。工具引用与治理字段的冻结语义见协议 §5.2。

公开声明中没有 AppSecret。实例管理凭据、OAuth 客户端认证与用户/终端访问凭据必须分开。不要提交一份由人手工维护的工具 Schema 副本来替代 MCP 的实际发现能力。Mira 外层只保存 tool name 引用；规范工具身份由 `(APP_ID, serviceId, MCP tool name)` 确定，真实 Schema 与 ToolAnnotations 始终来自标准 `tools/list`。

## 3. 在 Mira ID 登记实例

目标界面：

```text
Mira ID → 我的应用 → 登记应用

应用地址  https://mail-a.example
APP_ID    [从自己的部署实例获得]
AppSecret [从自己的部署实例获得]

验证 → 预览应用与服务 → 登记
```

这三个输入各有独立职责：**应用地址/Origin 用来定位实例，APP_ID 是稳定实例身份，AppSecret 用来证明当前登记者掌握实例管理凭据；三者缺一不可。** Mira ID 根据 [协议的登记验证](open-platform-protocol-v1.md#32-登记验证) 校验三者属于同一实例，然后自动读取名称、图标、OAuth callback、service、scope、resource、MCP endpoint 等元信息。登记通过后，在「我的应用」看到实例和服务信息。不能仅凭名称或公开 APP_ID 认领别人的实例；错误凭据、身份冲突、地址不一致须显式提示。

正常登记不需要额外开发者账号、管理员资格审批，也不需要开发者到 Mira ID 服务器运行 CLI；callback、serviceId、scope、resource 和 MCP endpoint 也不需要人工录入。敏感信息只通过必要的验证通道传递，不能放在 URL、声明、日志或客户端持久存储中。

## 4. 接入通过 Mira ID 登录

应用网站提供「通过 Mira ID 登录」入口。按 [开放应用 OAuth V1](application-oauth-v1.md) 实现授权码 + PKCE S256：应用生成 state/verifier，经 Mira ID 浏览器授权后验证回调 state，再在服务端兑换应用专属凭据。登记 AppSecret 不进入 OAuth，不提供安装 ID、platform 或 client_secret。

用户成功登录应用实例后建立账号使用授权，不获得该实例所有权。应用必须验证返回的 issuer、subject、audience、APP_ID 和有效期，再按自身业务准入策略建立本地会话；通过应用会话查询接口确认授权仍有效。Mira ID 会话被停用或撤销时应用不能继续将旧本地会话视为有效 Mira ID 身份。应用不得拿应用专属凭据访问其他 Mira 服务或设备。

具体请求字段、应用退出、撤权、停用与声明修订语义以该 HTTP 合同为准。生产切换必须与狐邮和 Mobile 消费端联合验收，不允许旧 Cloud Session 兑换兜底。

## 5. 对 Mira 终端提供服务

应用登记本身不是每台手机/桌面的配置。用户成功授权后，所属有效 Mira 终端通过 Mira ID 获取账号关联目录，按自身支持的服务类型连接。

开发者只需提供自己的服务，并验证 Mira ID 签发、与本实例资源及权限匹配的访问凭据。不要要求终端上传 AppSecret、原始 Cloud Session 或邮件等业务系统的管理密钥。应用必须自行验证业务用户、数据归属与授权；被登记不等于可以越权访问或执行工具。

### MCP 服务（当前重点：完整标准 MCP）

1. 以 [MCP 最新稳定官方规范](https://modelcontextprotocol.io/specification/latest) 实现标准 endpoint（截至 2026-11-25 为 2026-07-28）。不裁剪协议、不使用 Mira 私有 MCP 消息；满足适用必选要求，按实际支持情况协商官方可选能力。
2. 在外层应用声明中提供 type、protocol、resource、scope 等。受保护 HTTP 服务按标准 RFC 9728 resource metadata 与 MCP Authorization 进行认证发现和资源绑定；Mira ID 接入必须兼容标准流程，具体 token 合同以最终协议为准。
3. 2026-07-28 逐请求提供版本与能力元数据，服务端实现 server/discover；通过 tools/list 与 tools/call 发现和执行工具，遵守官方分页、缓存和变化通知规则。resources、prompts、官方扩展同样使用官方协议。当前 V1 实施直接切到 2026-07-28，不保留旧 initialize/initialized、多版本协商或失败后降级。
4. 可在 Mira 外层声明表达适用终端、能力分组、标准 toolRef、`selectionWeightHint` 与多维 `riskHints`；不把它们作为 MCP 私有必选字段或私有协商。toolRef 只引用 `tools/list` 的真实 tool name，不复制 Schema。标准 ToolAnnotations 原样遵守。Mira 不定义 R0–R4 等单轴风险等级；riskHints 只能增加风险上下文，缺失某项不代表该风险不存在，`confirmationHint: recommended` 也只是建议。完整规则见 [协议 §5.2](open-platform-protocol-v1.md#52-mira-外层服务声明与治理信息)。
5. 服务端继续检查业务对象归属和操作授权。标准 MCP Client 在合法授权下可直接使用服务，不需理解 Mira 外层声明；Mira 终端可利用治理信息，但登记或 token 不等于任意操作获准。
其他类型尚未定义；不要为了通过登记而将非 MCP 服务伪装成 MCP，也不需要提前实现一个泛化工具框架。新类型出现时定义自己的 profile，复用已有应用身份、授权和服务目录。

## 6. 在 Mira ID 查看结果

| 关系 | 我的应用 | 关联服务 |
| --- | --- | --- |
| 自己部署并登记，但尚未登录授权 | 有 | 无 |
| 自己部署、登记且成功登录授权 | 有 | 有 |
| 登录并获准使用别人的部署实例 | 无 | 有 |
| 同一项目两个不同实例均获使用授权 | 仅显示自己登记的实例 | 两个实例分别展示 |

应用的名字可以相同；用域名与实例标识消歧。最终所有权移除、共同管理、分享准入、撤权交互与声明变化的授权策略以协议评审结果为准。

## 7. 接入自检清单

开发测试使用独立的测试账号和实例，不用生产数据。

- [ ] 两个部署使用同一项目，但拥有不同 APP_ID、AppSecret、回调与服务资源。
- [ ] HTTPS Origin、APP_ID、AppSecret 三者验证一致：Origin 可定位实例、发现文档 APP_ID 匹配、Secret 验证成功；callback/service/resource 从元信息读取，不公开秘密，不接受任意回调或未验证来源。
- [ ] 自己的 Mira ID 可登记实例；另一账号无法未经授权取得管理权。
- [ ] 另一账号成功 OAuth 登录后能够使用获准服务，不获得所有权。
- [ ] 同账号 Mobile 与 Desktop 可以发现同一获准服务，各自使用对应的短期凭据。
- [ ] 两个实例不能相互接受错误受众/资源的访问凭据，业务数据仍相互隔离。
- [ ] 独立标准 MCP Client 在合法授权下可直连服务；Mira Client 按 2026-07-28 发现和调用实际工具，不要求 Mira 私有字段；只实现旧 initialize/initialized 的服务不会被生产客户端静默兼容。
- [ ] 外层治理信息不改变标准 MCP 行为：toolRef 能与实际 `tools/list` 精确核对；未分组真实工具不被吞掉；unresolved 引用不伪造工具；缺失 riskHint、建议权重或 confirmationHint 都不能降低本地治理；未知服务类型不被当成 MCP。
- [ ] 失效、撤权、重放与错误回调得到正确处理，升级不静默扩大授权。

完整验收标准与尚待决策项见 [协议 §7](open-platform-protocol-v1.md#7-实施前的未决问题与验收证据)。本指南不产生新的实现合同或部署授权。
