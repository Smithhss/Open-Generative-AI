# FYT 工作台首发操作手册

本目录为待审核配置；本轮不部署生产、不改 DNS/证书/线上 Nginx，不创建提交。生产变更需用户单独确认。实际应用固定 `https://fytapi.com/create`；`create.fytapi.com` 只在签发证书后可选重定向到主站对应路径。

## 发布门槛与版本锁

- 在两仓分别记录完整40位提交、递归子模块提交、dirty状态；未提交的工作树不能伪装成可复现正式版本。
- 用 `release-lock.env.example` 记录新旧两套 Go/工作台提交及镜像 `repo@sha256:<64 hex>`，保存在发布证据目录。锁文件不含密钥；所有占位项填实后才可发布。本候选尚未有最终 commit/digest，不可拿示例直接上线。
- 镜像必须是 `linux/amd64`，工作台 `basePath=/create` 在构建时固定；运行时改环境变量不能修复构建错的 basePath。
- Go 的现有 `deploy/prod/deploy.sh` 使用版本标签。生产执行前将批准的不可变 digest 对应到唯一 tag，并验证其镜像ID/digest，禁止直接把 `repo@sha256:...` 拼入现有 `FYT_IMAGE:FYT_TAG` 格式。保留旧镜像和旧前端目录，不改已有发布脚本或 CI。
- GitHub Web CI 若仍因 artifact storage quota 满而上传失败，这是正式发布包阻塞；不删除未知历史产物、不调低 CI 验收。可先准备本地验证包与校验和供审阅，不能冒称 GitHub 产物已就绪。

本地候选构建命令（先确认源码 clean、递归子模块均固定；不推送）：

```bash
# STUDIO_COMMIT 为已审核完整提交；BUILD_TAG 为该提交的唯一候选标签。
git rev-parse HEAD
git submodule status --recursive
git status --short
docker buildx build --platform linux/amd64 --load \
  -f deploy/fyt-staging/Dockerfile \
  --build-arg NEXT_PUBLIC_STUDIO_BASE_PATH=/create \
  --label org.opencontainers.image.revision="$STUDIO_COMMIT" \
  -t "$BUILD_TAG" .
docker image inspect "$BUILD_TAG" --format '{{.Os}}/{{.Architecture}} {{.Id}}'
```

推送镜像需另行授权。授权后记录 registry 返回的 digest，拉取 digest 复核平台与 revision。只有本地 `sha256:...` image ID 不等于 registry digest；未推送时记录 ID、构建日志、`docker save` 包 SHA256，不伪造 `repo@digest`。Go 镜像/前端包同样记录来源提交和 SHA256；Web CI 上传阻塞未解除时停在此门槛。

## 配置和持久化

| 配置 | 要求 |
|---|---|
| `FYT_STUDIO_IMAGE` | 批准的不可变 registry digest，无 `latest` 或浮动 tag |
| `FYT_TICKET_SECRET` | 外部随机至少32字节，独立于预发；空值 compose 拒绝，弱值启动器拒绝 |
| `FYT_INTERNAL_API` | 容器网络 `http://foyton-api:3000`，不是预发 `api:3000` |
| 网络 | 默认 `fytapi-go_foyton-api-network`；先 inspect 当前 Go 容器确认实际名称，必要时外部变量覆盖 |
| studio数据 | 命名卷 `fyt-studio-prod-data:/app/data`，非root node可写；仅一个副本 |
| Go产物 | Go compose `ARTIFACT_DIR=/data/artifacts`，沿用原 `/data` 挂载；不设置 `ARTIFACT_ALLOW_PRIVATE` |
| 端口 | 宿主机仅 `127.0.0.1:3002:3000`，由主站 Nginx 代理 |

真实密钥通过受保护的外部 env 文件/密钥管理传入（`chmod 600`）；写入 Obsidian 项目凭证笔记，不写仓库、release lock、终端输出或日志。预发也必须外部提供独立密钥。健康检查只验证 `/create/zh/studio` 可达，不代表用户隔离/计费已验收。镜像 CMD 先运行 `scripts/fyt-start.mjs` 校验密钥，再启动 standalone server；构建期不索取密钥。

```bash
# 以下命令仅在获生产变更授权后执行；路径指向外部受保护配置。
docker compose --env-file /secure/fyt-studio.env -f deploy/fyt-prod/compose.yml config --quiet
docker network inspect fytapi-go_foyton-api-network
```

不要用 `docker compose config` 的完整输出收集生产证据，它会展开密钥。不要 `down -v`、删数据卷或改卷名；新部署目录/容器重建必须继续复用同一命名卷。首次备份需含Go数据库、Go `/data/artifacts`、studio `/app/data`；备份文件含用户私有内容，限制权限并演练恢复。

## 同源路由与上线顺序

Go 仓库 `deploy/staging/nginx/variants/stage7.conf` 是路由源，`deploy/prod/nginx/render.sh --check` 必须通过。生成配置承接 `/create`、`/create/*`（含Next资源），将根 `/api/v1/creative-agent/*` 改写到工作台 `/create/api/v1/creative-agent/*`。其余 `/api`、`/pg` 等仍交 Go。子域模板是 `.template`，默认不被主站 include；不可在子域证书尚未签发时安装成 `.conf`。

1. 获准后先备份现有配置/数据与旧发布锁。检查当前 pending 任务，记录用户、task_id、request_id、预扣金额/渠道状态；不得自动重提收费POST。
2. 先摘工作台导航入口，并将工作台四个专属 location 暂换为维护 `return 503;`（先备份、`nginx -t` 后 reload）；其余API和主站登录/充值保持。独立子域重定向不承担开关角色。
3. 发布已批准Go版本、配套同版轮询/worker，确认 `/api/status`、登录、余额与任务查询正常；`ARTIFACT_DIR` 位于持久化 `/data`，私网放行未开。不要把新pending留给不兼容旧poller。
4. 只启动单副本工作台：`docker compose --env-file /secure/fyt-studio.env -f deploy/fyt-prod/compose.yml up -d --no-build studio`，确认healthy、卷可写、Go内网可达。未经生产授权不执行本步。
5. 安装已审核生成的主站Nginx配置，检查与预发路由一致后 `nginx -t` 再reload。工作台四个location恢复代理，导航入口最后开启。
6. 使用mock上游/不收费fixture完成下列验收。真实付费生成由用户另行确认，记录请求ID与账务结果。
7. 子域 DNS/证书如需上线，单独确认后签发证书，再安装 Go 仓库 `create.fytapi.com.conf.template` 为站点 `.conf`，`nginx -t` 后reload；确认308路径和query保留。主站上线不依赖该子域。

## 验收记录（每项记录版本、时间、证据）

- [ ] 新空卷冷启动：非root可写，健康，缺失/弱票据secret启动失败；不输出secret。
- [ ] 模拟用户A/B与匿名：会话列表/消息/删除/事件、资产读取/下载、任务查询互相隔离；伪造/过期票据拒绝；旧无owner文件保留且不能被首访认领。
- [ ] 主站登录→`/create/zh/studio` 深链、刷新Cookie、刷新页面、从控制台退出→工作台身份清空；使用主站同源，不能拿旧独立子域的测试代替。
- [ ] `/create/_next/*` 实际引用资源200；两种 creative-agent 前缀路由一致；`/api/user/self`、`/pg`仍Go；未知近似前缀不误路由。
- [ ] mock生成成功后不访问作品页也自动缓存；容器restart及 `up --force-recreate --no-deps studio` 后会话/资产仍存在，Go容器重建后产物可取。
- [ ] 两用户重复产物任务各自隔离；用户删除作品后列表/下载/worker/重启均保持隐藏，计费记录仍存在；冷启动扫描不重新暴露隐藏产物。
- [ ] 同用户并发2上限，超限不扣费；超时/断线不自动重提收费POST；pending的成功/失败/退款状态与任务和消耗日志一致。
- [ ] 工作台停机时主站Nginx仍能加载，登录/API/充值不受影响；执行摘入口、回滚、数据恢复演练。
- [ ] 记录前后新旧所有镜像digest、提交、子模块、前端包校验和；Web产物配额阻塞已明确解除或保留为未发布原因。

## 回滚与pending人工对账

先摘导航与四个工作台location到503，执行 `nginx -t` 后reload，保留API/数据库/数据卷。优先只回滚工作台到上一批准digest，恢复匹配 `/create` 的版本；Go若需回滚，先冻结新提交并盘点所有pending，明确旧版本能否查询/结算新任务。不能只回滚提交端而把新任务遗留给不同语义的旧poller。

逐笔人工对账：`user_id → task_id → request_id → 预扣/实际扣费/退款日志 → 上游状态 → 本地终态`。上游超时/未知结果不等于未扣费；不可自动重新生成、二次退款或删除账务记录。确认旧版无法安全处理时，保持受影响入口关闭并由兼容新版本完成存量结算，再回滚；不能通过改DB状态“清空pending”。

数据格式没有向后兼容证据时停止回滚，保留新旧快照请求人工决定。不覆盖数据库、不清旧无owner文件、不删除隐藏元数据、不恢复旧备份到在线卷。完成存量任务/账务核对后，才恢复路由与导航。保留新旧镜像、日志、持久卷和备份直到验收窗口结束。

## 本轮配置验证证据（2026-10-25）

- 两份工作台 compose 与 Go prod compose 使用 `--env-file /dev/null`、纯测试占位变量执行 `config --quiet` 通过；没有载入或输出真实 `.env`。
- Go `render.sh --check`、两份 shell `bash -n`、两仓 `git diff --check` 通过。
- 临时 `nginx:1.24-alpine` 容器检查 stage7 原配置（studio未启动）通过；生产生成配置与可选子域模板使用临时自签证书、测试DH参数进行 `nginx -t` 通过。
- 同一临时 Nginx 以两个返回请求路径的本地stub上游实测11项：`/create`、页面深链/query、Next资源、根creative-agent及子路径重写、Go self/pg、两个近似前缀、两个子域308映射均通过。只验证代理分流，不代表真实Next资源/会话/账务验收完成。
- 临时容器和临时证书目录已清理；现有本机预发服务未启动/替换/重载。正式镜像构建、生产证书链、登录闭环、冷启动/重建持久化与用户隔离由主线统一集成验收，不能据此宣称已上线。
