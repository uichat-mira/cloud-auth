# Mira Cloud Auth 部署与排障指南

> 适用范围：`uichat-mira/cloud-auth` 的 V0 自托管生产服务（截至 2026-10-24）。这是运维操作指南；实际行为以同一环境分支的 Compose、Actions、部署脚本及服务器运行态为准。
>
> **最重要的验收原则：不能只看 GitHub Actions 绿灯、HTTP 200 或 TLS 证书存在。必须核对生产部署 SHA、Caddy 实际监听入口，以及公网入口返回的 /health JSON 正文。**

## 1. 服务边界与拓扑

```text
cloud-auth.tomzlab.cn (DNS)
  → 服务器公网入口/NAT
  → Caddy 所绑定的主机内网网卡 :443
  ├─ /health、/ready、/v1/* → reverse_proxy 127.0.0.1:8788 → Docker: Fastify API
  └─ 其他路径 → /opt/cloud-auth/web → React Account Portal（SPA fallback）
  → 持久化 SQLite WAL (/opt/cloud-auth/data)
```

- Cloud Auth 负责 Mira Cloud Account、Cloud Session 相关认证，不替代 Desktop 本地身份、Remote Host 授权或模型服务。
- 生产目录：`/opt/cloud-auth`；Compose 文件：`docker-compose.prod.yml`；生产容器镜像：`mira-cloud-auth:prod`。
- 应用端口仅发布到服务器回环 `127.0.0.1:8788`，**不要**向互联网开放 8788。Caddy 负责 HTTPS。
- 生产交付物由同一 Docker build 产生 API 与 Account Portal。容器运行 Fastify API；部署脚本从同一镜像提取 `apps/web/dist` 到 `/opt/cloud-auth/web`，由宿主 Caddy 直接提供静态页面。
- OPS-014 已移除原来基于 `String.raw` 的临时登录验收页、运行开关和 test Caddy 的 `/_acceptance/` 代理。正式验收走 `/login` 与 `/account`；不要恢复测试专用的密码表单。
- MiraAI/New API 是同一宿主机上的**其他服务**，不是 Cloud Auth 的上游；这份指南不负责部署或改动它们。
- 规范来源：[环境模型](https://github.com/uichat-mira/.github/blob/main/docs/engineering/environment-model.md)、[测试标准](https://github.com/uichat-mira/.github/blob/main/docs/engineering/testing-standard.md)、[Cloud Auth 设计](https://github.com/uichat-mira/.github/blob/main/docs/engineering/mira-cloud-auth.md)。

## 2. 上线前检查

### 2.1 主机

需有 Docker Engine / Compose、Caddy（systemd 服务）、可用的 SSH 账户，以及支持 `sudo -n` 的运维权限；部署动作需具备写入 `/opt/cloud-auth` 和 Caddy 配置的权限。先核对现有站点是否可用，避免改动共享网关时影响 MiraAI。

```bash
sudo systemctl is-active caddy
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker compose version
```

DNS 应指向实际公网入口。公网地址可能经 NAT 映射到 **主机内网网卡**，不一定出现在 `ip addr` 中；不要因公网 IP 不属于网卡就将 Caddy 绑到公网 IP。

### 2.2 GitHub Actions 凭据

生产工作流位于 [`.github/workflows/deploy-prod.yml`](../.github/workflows/deploy-prod.yml)，使用以下 Actions Secrets：

| 名称 | 用途 |
| --- | --- |
| `DEPLOY_HOST` | SSH 目标主机 |
| `DEPLOY_USER` | SSH 用户 |
| `DEPLOY_PASSWORD` | SSH 登录密码 |
| `DEPLOY_PORT` | SSH 端口，工作流未填写时默认 22 |

不要将这些值写入仓库、诊断日志或工单。当前生产工作流使用 SSH **密码**连接，不要求新增 SSH Key。仓库旧文档提到 `MIRA_DEPLOY_ENABLED`，但**现有 `deploy-prod.yml` 没有读取它作为发布开关**，不能把它当成生效的防护。运行前核对仓库/环境的权限和当前工作流。

### 2.3 分支纪律与执行入口

```text
feat/* → dev → test → prod
```

- 功能/脚本变更：先 PR 到 `dev`，通过相关检查；按已审候选进入 `test`，最后才进入 `prod`。不要因为分支发生分叉就整分支强合并并夹带无关代码；必要时仅提升已审的变更。
- `test`：手动触发 [Deploy Cloud Auth Test](../.github/workflows/deploy-test.yml)；不是一个常驻独立实例。测试与生产部署使用同一宿主机回环端口 **8788**，安排明确的测试窗口，不要在生产正在提供服务时随意启动测试部署。测试域名直接访问 `/login`、`/account`，不再配置 `/_acceptance/` 代理。
- `prod`：**push 到 `prod` 自动触发** [Deploy Cloud Auth Production](../.github/workflows/deploy-prod.yml)，也支持手动 `workflow_dispatch`。重跑生产工作流会再次构建、上传并重建容器；它不是无副作用的“状态检查”。
- `main` 不是生产环境分支。部署前记录待发布 commit SHA、回滚锚点与数据库备份位置。

## 3. 生产部署做了什么

以当前 `prod` 工作流、[`scripts/deploy-prod.sh`](../scripts/deploy-prod.sh) 和 [`scripts/install-caddy-prod-route.sh`](../scripts/install-caddy-prod-route.sh) 为准：

1. GitHub Runner 从目标 `prod` commit 构建并打包 `mira-cloud-auth:prod`；该镜像同时包含 Fastify API build 与 `apps/web/dist`。
2. SSH/SCP 将镜像包、Compose、部署脚本、Caddy 路由模板上传至 `/opt/cloud-auth`。
3. 若旧生产容器在运行，先执行 `scripts/backup.mjs` 生成一致的 SQLite 快照至 `/opt/cloud-auth/backups/<UTC时间戳>/`。这是**服务器本地**备份；还需要按基础设施策略另存到受控的外部备份位置。
4. 停止可能仍运行的临时测试服务，再用 Compose 重建生产容器，等待回环 `/ready`。
5. 从**同一镜像**提取并校验 Web build，发布到 `/opt/cloud-auth/web`；随后安装 Caddy 站点片段、验证 Caddyfile、热重载。
6. 执行 API `/health`、Web build 标识检查和 Argon2 benchmark，写入 `/opt/cloud-auth/.deployed-sha`，并回收临时测试镜像资源。

**不要**手动删除 `/opt/cloud-auth/data`，也不要将测试 SQLite 数据库拷贝进生产。生产 Compose 把数据、备份目录作为持久卷映射，容器重建不等于清空数据库。

## 4. 关键：Caddy 监听地址必须一致

2026-10-24 事故根因：现有 `mira-ai.tomzlab.cn` 使用**明确的内网网卡 `bind`**，旧版 Cloud Auth 片段只有通配监听。请求落在具体网卡的 Caddy 监听入口时，Cloud Auth 可能得到 **200 OK + Content-Length: 0**，而经 `127.0.0.1:443` 请求却得到正常 JSON。

实际有效的 Cloud Auth 片段（网卡地址仅为示意，**不要照抄**）：

```caddyfile
cloud-auth.tomzlab.cn {
    bind <与现有公网 Caddy 站点相同的主机内网地址>

    @api path /health /ready /v1/*
    handle @api {
        reverse_proxy 127.0.0.1:8788
    }

    handle {
        root * /opt/cloud-auth/web
        try_files {path} /index.html
        file_server
    }
}
```

- 仓库 `deploy/mira-cloud-auth-prod.caddy` 是**无硬编码主机 IP**的模板；新版生产安装脚本从宿主机 Caddyfile 中 `mira-ai.tomzlab.cn` 的 `bind` 获取当前地址并写入生产片段 `/etc/caddy/mira-cloud-auth.caddy`。
- 安装脚本按当前宿主机的 MiraAI 站点结构匹配；若迁移服务器、重构 Caddyfile 或去掉 MiraAI `bind`，必须**重新检查生成的片段**。当前脚本在未找到该绑定时会跳过添加，不能误当作“已自动修好”。
- 主 Caddyfile 中需要存在 `import /etc/caddy/mira-cloud-auth.caddy`。检查实际运行配置而非只看 GitHub 模板。
- 手动修订 Caddy 前分别备份主 Caddyfile **和** Cloud Auth 片段；当前安装脚本自动备份主 Caddyfile，但不是完整的配置事务回滚机制。
- 先 `caddy validate`，再 `systemctl reload caddy`，**不要**为了修一个子域名重启整机/清空证书或修改其他站点。

只读检查：

```bash
sudo grep -nE 'mira-ai.tomzlab.cn|mira-cloud-auth.caddy|bind' /etc/caddy/Caddyfile
sudo cat /etc/caddy/mira-cloud-auth.caddy
sudo ss -lntup | grep ':443 '
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

## 5. T5：生产验收（必须核对正文）

以下在**目标服务器上**执行；需要已部署版本的 SHA 与候选 commit 一致。

```bash
cat /opt/cloud-auth/.deployed-sha
docker compose -f /opt/cloud-auth/docker-compose.prod.yml -p cloud-auth ps
curl --noproxy '*' -fsS http://127.0.0.1:8788/ready
curl --noproxy '*' -fsS http://127.0.0.1:8788/health
```

预期 API 响应：

```json
{"status":"ok","service":"mira-cloud-auth"}
```

继续验证 Caddy **不同监听入口**，尤其公网入口。用实际地址替换占位符：

```bash
# 本机 loopback：验证本机 Caddy TLS/SNI
curl --noproxy '*' -sSi --resolve cloud-auth.tomzlab.cn:443:127.0.0.1 \
  https://cloud-auth.tomzlab.cn/health

# 公网/NAT 入口：不跳过 TLS 证书校验
curl --noproxy '*' -sSi --resolve cloud-auth.tomzlab.cn:443:<PUBLIC_IP> \
  https://cloud-auth.tomzlab.cn/health

# 独立校验相邻业务未回归
curl --noproxy '*' -sS -o /dev/null -w '%{http_code} tls=%{ssl_verify_result}\n' \
  https://mira-ai.tomzlab.cn/
```

通过条件：目标生产 SHA 正确、容器 healthy、`/ready` 正常、Caddy 证书验证成功，公网/NAT 入口 `GET /health` 返回正确 JSON 正文；同时 `GET /` 与直接刷新 `GET /account` 均应返回 Account Portal 的 HTML shell。API 与 Portal 两条路径都要验，不用 `HEAD` 或 `curl -I` 代替正文验收。

GitHub-hosted Runner 对中国内地入口可能报 TLS reset，而浏览器或服务器自测正常。当前生产工作流对此仅发出 warning，**不会使作业失败**：绿灯证明部署步骤完成，不等于公网 T5 通过。请记录实际测试位置、时间、SHA 和正文结果；有疑义再从独立网络/真实客户端复核。

## 6. 故障定位顺序

| 现象 | 下一步 |
| --- | --- |
| DNS 正确，`/health` 得到 200 + 0 字节 | 对比 `127.0.0.1:8788`、Caddy loopback、内网网卡和公网入口的 **GET 正文**；核查不同 `bind` 是否导致监听路由错配 |
| 应用 `/ready` 失败或 503 | 查容器健康、SQLite 权限、迁移和只读文件系统配置；先保护数据 |
| Caddy 返回 502 | 查 `127.0.0.1:8788` 监听和容器日志；与域名证书问题分开 |
| HTTPS 握手失败 | 比较相同来源网络下两个域名的 SNI、证书与 TLS；查 `journalctl -u caddy`，不要直接认定是备案或域名供应商 |
| `/` 或 `/account` 404/空白，但 `/health` 有正确 JSON | API 正常但 Portal 静态交付/Caddy fallback 异常；检查 `/opt/cloud-auth/web/index.html`、Caddy root/try_files 和部署 SHA |
| Runner 请求连接重置而服务器侧正常 | 记录源网络差异和警告，增加浏览器或其他实际客户端验收；不要因 CI 网络错误就改 DNS/证书 |

```bash
docker compose -f /opt/cloud-auth/docker-compose.prod.yml -p cloud-auth logs --tail=100
sudo journalctl -u caddy --since '30 min ago' --no-pager
```

日志、工单和截图需脱敏：不暴露 SSH 凭据、Cloud Session、生产账号、数据库、证书私钥和敏感请求头。

## 7. 备份、回滚、恢复

1. 上线前记录：待部署 SHA、上一个正常 `prod` SHA、镜像/产物状态、`.deployed-sha`、备份路径、Caddy 主文件与片段的备份路径。
2. 仅 Caddy 配置故障：先保存当前现场，恢复本次修改前备份的相关 **主文件及片段**，`caddy validate` 后热重载，再分别复核 Cloud Auth 与 MiraAI。不要盲目覆盖整个共享 Caddyfile。
3. 应用回滚：通过经过审查的回退变更按组织发布纪律进入 `prod`，让正式工作流重新部署准确的旧版候选。注意当前工作流**按 prod commit 重新构建镜像**，不保证镜像标签本身保留历史版本。
4. 数据恢复属于高风险操作：先确认 migration 与回退程序兼容、选择已验证的 SQLite 一致性备份，安排维护窗口；不要在 WAL 数据库仍运行时直接覆盖 `auth.sqlite`。备份脚本见 [`scripts/backup.mjs`](../scripts/backup.mjs)。
5. 如果生产 T5 未过且无法及时安全修复，按事故严重性回滚并记录未通过的检查，不应因为 Actions 状态是 success 就认定已恢复。

## 8. 2026-10-24 事故记录（供复盘）

- 症状：用户浏览器的 `https://cloud-auth.tomzlab.cn/health` 返回 `200 OK`，`Content-Length: 0`，白屏；`mira-ai.tomzlab.cn` 正常。
- 诊断：Auth 后端直连与 Caddy loopback 返回 43 字节 JSON；公网/NAT 入口返回空正文。两条入口 TLS 证书有效且一致。实际 Caddyfile 中 MiraAI 有明确的主机内网网卡 `bind`，Cloud Auth 初始路由没有。
- 修复：使 Cloud Auth 与 MiraAI 共享相同 `bind`，先热修复，之后将安装脚本改为动态沿用现有 `bind`（未在仓库硬编码主机地址）。
- 生产证据：发布 `6d0a2e1ebc5700f88fbb672b3ee0f85bb6539bf2` 后，服务器端独立 T5 得到 `200 OK`、`Content-Length: 43`、正确 JSON，MiraAI 返回 200。
- 代码推广：[dev PR #30](https://github.com/uichat-mira/cloud-auth/pull/30) → [test PR #31](https://github.com/uichat-mira/cloud-auth/pull/31) → [prod PR #32](https://github.com/uichat-mira/cloud-auth/pull/32)；[生产部署](https://github.com/uichat-mira/cloud-auth/actions/runs/40051591662)、[独立 T5](https://github.com/uichat-mira/cloud-auth/actions/runs/40051693420)。

## 9. 常用源码入口

- [`docker-compose.prod.yml`](../docker-compose.prod.yml) — 容器端口、健康检查、数据卷和资源限制
- [`.github/workflows/deploy-prod.yml`](../.github/workflows/deploy-prod.yml) — 自动发布与 SSH/上传步骤
- [`scripts/deploy-prod.sh`](../scripts/deploy-prod.sh) — 备份、部署、就绪检查、KDF benchmark
- [`scripts/install-caddy-prod-route.sh`](../scripts/install-caddy-prod-route.sh) — Caddy 生成、bind 协调、校验和热重载
- [`docs/auth-v0.md`](auth-v0.md) — 身份与会话契约；请勿把账号密码写进部署手册
