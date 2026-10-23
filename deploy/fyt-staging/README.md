# 接入现有 fyt 本机预发布

用户已授权本机预发集成。生产、渠道、计费、数据库结构及既有用户密码不在本次变更范围内。

## 当前入口

- 图片工作台：`http://127.0.0.1:18443/create/zh/studio`
- 视频工作台：`http://127.0.0.1:18443/create/zh/studio/video`
- fyt 原登录与控制台：同一地址的 `/login`、`/console`。
- 8080 是上一轮独立隔离演示，13100 是其模拟后端；本轮验收使用18443，不混用数据。

## 服务与构建

本目录 Compose 独立管理 `fyt-creative-staging-studio-1`，接入已存在的 `fyt-staging_default` 网络，别名 `fyt-studio`。不发布新宿主机端口，不连接数据库，不挂载凭证，不替换既有API/Redis/PostgreSQL/前端服务。

```bash
docker compose -f deploy/fyt-staging/compose.yml build studio
docker compose -f deploy/fyt-staging/compose.yml up -d --no-build studio
```

当前无限画布镜像 `fyt-studio:staging-canvas-20261023-v1`（原版预览镜像 `fyt-studio:staging-20261023` 保留）：Node 24 bookworm-slim、锁文件 npm ci、跳过 Electron 二进制；在 Linux 容器里构建四个子包与 fyt 模式 Next standalone 产物。运行用户为 `node`，Next监听容器内3000。运行镜像包含 standalone追踪文件、静态资源、public和许可证，不依赖宿主机node_modules。`.dockerignore`排除Git、缓存、环境文件和凭证。

当前 fyt API 使用既有本地镜像 `fyt-api:local`，本轮部署时镜像ID为 `sha256:7919a16f8a8849e7109c6077f22fff1126439efb4b21136305d89e438347ad6e`。API返回版本号为空，不能把它当成某个已确认Git提交；本轮没有重建或替换它。

## Nginx变更

在现有 `foyton-relay/deploy/staging/nginx/conf.d/fytapi.conf` 的server内加入本目录 `studio.locations` 内容，使用 `BEGIN/END FYT CREATIVE STUDIO` 标记包围。仅 `/create`、`/create/` 代理到 `fyt-studio:3000`，请求路径保持不变；Docker DNS通过 `127.0.0.11` 动态解析，避免工作台未启动/重建时阻止整个fyt Nginx加载配置。`/api`、`/pg`、`/v1`、`/_fyt`和原控制台分流不改。Next本地开发rewrite不在此镜像中启用。

```bash
docker exec fyt-staging-nginx-1 nginx -t
docker exec fyt-staging-nginx-1 nginx -s reload
```

配置和路由插入前备份及哈希保存在 `deployment-state.local` 指向的 `.trash/fyt-studio-staging-20261023-*` 目录。该state是本机文件，已被忽略，不是跨机器部署配置。

## 本轮已验收与待办

| 项目 | 结果 |
|---|---|
| 干净Linux镜像构建与非root启动 | 通过，容器healthy |
| 原版图片/视频页面、Next静态资源 | HTTP200 |
| 原登录/控制台/API | 保留，HTTP200 |
| 已有管理员密码登录并回跳 | 浏览器通过 |
| 工作台与原控制台钱包余额 | 相同 |
| 刷新会话及管理员草稿恢复 | 浏览器通过 |
| 原控制台退出→工作台清空身份/余额/草稿 | 浏览器通过 |
| 匿名读取 `/api/user/self` | HTTP401 |
| 旧MuAPI生成/上传代理 | HTTP404，预览生成按钮禁用 |
| 工作台停机对原fyt的影响 | 停机时Nginx配置检查仍通过，/login与/api/status仍200，仅/create返回502；工作台重启后恢复200 |
| 普通账号/双账号草稿隔离 | 2026-10-23用户亲验通过：管理员A草稿与studioqa_pre的B草稿互不可见，切换回原账号恢复对应草稿。凭证保存在Obsidian；此项为用户手动验收，非代理自动浏览器验收 |
| 图片/视频真实渠道、价格、生成、退款、成本 | 渠道接入后执行，本轮无真实生成 |

## 回退

1. 从 `deployment-state.local` 读取备份目录，对比现配置的SHA256与 `after_sha256`。若不同，说明有人后来修改过，应只撤本轮标记的块，不整文件覆盖。
2. 若一致，恢复备份的 `fytapi.conf`，执行 `nginx -t`；仅检查成功后reload。
3. 工作台入口撤下后，可执行以下命令停止独立工作台。保留原fyt服务和数据卷。

```bash
docker compose -f deploy/fyt-staging/compose.yml stop studio
```

本轮不含生产部署、提交、推送或任何真实媒体收费验证。


## 文本助手增量与回退（2026-10-23）

本轮只替换独立studio容器，原Go/API/DB/Redis/Nginx保持。新入口 `/create/zh/studio/agents`，四模板、系统提示词、流式多轮、本机历史和余额刷新。文本请求会消耗fyt额度；图片视频仍关闭。

代码/协议检查与真实收费验收分开：未自动发起模型调用，浏览器工具仍被已保存的网站权限拒绝，页面体验由用户手动确认。GET定价目录仅确认聊天端点元数据；认证模型可用性仍需页面验证。

原镜像manifest ID：`sha256:8866d343b11f82839c114bb8d5c34dca24ab2b245a0d63f4d85e99782d3a47fb`，标签 `fyt-studio:staging-20261023`。回退本轮文本助手只需将compose的studio.image设回该旧标签后 `docker compose -f deploy/fyt-staging/compose.yml up -d --no-build studio`；不覆盖Nginx配置，不回滚数据库，不删除本机历史。

验证记录：2026-10-23文本首版新容器healthy；镜像ID `sha256:3c5691a97a3e74c7e1dabe320297b8d0dcc638da513cc2fc9d62aa22ba050278`。agents/图片/视频/login返回200，/api/status成功，匿名self401，旧MuAPI agents代理404；原API image ID保持7919a16f…不变。40项定向测试通过，Linux四子包+Next standalone构建通过。未做真实模型调用和自动浏览器验收。

### 用户委托复测（2026-10-23）

- `node --test tests/fyt-*.test.mjs`：40/40通过，覆盖会话刷新、账号/历史隔离、中文流分片、中断、错误、不自动重发、失效模型重选等。
- 8项运行时访问控制检查通过：GET /login和/api/status=200；匿名GET /api/user/self、/api/user/self/groups、/api/user/models?group=default及POST /pg/chat/completions=401；原MuAPI agents GET和fixture生成POST=404。匿名POST只验证认证拒绝，无上游生成。
- studio与原API容器healthy，API镜像未变。
- CUA再次拒绝18443（saved permission/managed policy）。未换浏览器、CDP、接口登录或其他间接方式绕过。页面交互、认证分组/模型和真实收费请求仍未验收。本轮没有使用任何凭证或发起付费生成。


## 本地编辑增量与回退（2026-10-23）

仅更新studio镜像为`fyt-studio:staging-local-editor-20261023-v1`。新增`/create/zh/studio/layers`本地标注/调色/PNG导出与`/apps`真实功能目录。图片不上传、不持久化、不收费；媒体生成保持关闭。

保留上一版`fyt-studio:staging-text-20261023-v1`（ID3c5691a97a3e…）。回退仅改compose studio.image回该标签并up --no-build studio；原Go/Nginx/数据库不动，不删除用户数据。

新功能的文件/尺寸/导入取消/URL释放/历史限制纯逻辑检查通过，独立审查修复橡皮后撤销、异步历史覆盖和触屏松手坐标问题；不声称真实浏览器绘图/像素导出已验收。

最终部署验证：镜像ID `sha256:26dd9fc7bb4644891d17459e354da1872f2e457c9c1ee4d73c7909f232553d16`，studio healthy。layers/apps/agents/图片/login/status为200，匿名self401，原上传代理404；原API image ID保持7919a16f…且healthy。46项定向检查与Linux构建通过，实际浏览器绘图/像素导出保持待用户验收。


## 无限画布增量与回退（2026-10-23）

新镜像`fyt-studio:staging-canvas-20261023-v1`，新增`/create/zh/studio/design-agent`本地无限画布与目录入口；非AI设计助手，不接远端服务/云保存。原本地编辑与文本助手保留。

保留上一版`fyt-studio:staging-local-editor-20261023-v1`（ID26dd9fc7bb46…），回退仅将compose studio.image恢复该标签后up --no-build studio，原Go/Nginx/数据库不动。构建会编译未提交的design-agent子模块修改，不应仅打包父仓而漏掉子模块源文件。

最终无限画布部署：镜像ID `sha256:a4711f428e050bab7a3837a85186d46debbb5ffe27da54250a84f18cf1ceec6d`，healthy。中英文design-agent、apps/layers/agents/login/status HTTP200；匿名self401；原creative-agent会话代理404。原API镜像保持7919a16f…且healthy。51项检查通过，未做真实浏览器/PNG像素自动验收。

## 本轮交付记录

## GPT Image 2 当前接入（2026-10-23）

- 入口http://127.0.0.1:18443/create/zh/studio，原ImageStudio画廊和底部PromptComposer。登录后default/gpt-image-2单张文生图，prompt<=4000，固定n1/b64_json/非流式，不传未经验证的size/quality。上传/图生图/批量/视频未开放。
- 同源/pg/images/generations复用UserAuth/分组授权/ImageRelay/预扣结算退款；前后端均禁自动重发。中断不能证明没扣费，应查请求ID。模型只取用户组可用集与显式gpt-image-2支持集交集，不信静态MuAPI目录。
- 结果只在页面内存，菜单切换保留，刷新/换账号清除；及时下载。提示词仍本机草稿保存，图片不写localStorage。下载/复制直接解码data:为Blob，不fetch(data:)或放宽远端CSP。
- 一次真实/v1生图：#27，26秒，1024PNG，RequestId 20261023143911902179467afedfe40mSLG7tfh，日志76465，user1实扣15003quota（$0.030006）。上游output1000、credit1，credit货币单价未知，不能当采购金额/利润。图片artifacts/gpt-image-2-staging-test.png。
- 新/pg测试：匿名401、n2=400、studioqa_pre无余额403、越权组403；普通测试账号quota/used_quota仍0，测试会话已退出。未重复收费做/pg成功生成；页面生成/下载/复制待用户体验，未绕过浏览器限制。
- 66项Node检查、Go参数/并发定向检查及Go arm64/四包+Next Linux构建通过。独立审查的下载CSP与组限流顺序问题修复后复核关闭。

### 版本与回退

后端源码独立~/develop/project/fyt-studio-images，codex/studio-images基线6239ccbf4；原镜像源码版本未知，不能保证新干净基线包含旧镜像的全部本地定制。未打包主仓其他dirty或c061成本schema。c061离线验证checkout原型已恢复干净。

- API fyt-api:studio-images-20261023-v1，ID6777491c9537…，version6239ccbf4-studio-images；studio fyt-studio:staging-images-20261023-v1，ID0925f366acfc…。两者healthy，studio/canvas/login/status200。
- 原主仓deploy/staging/.env仅API_IMAGE更新。数据库列清单前后SHA256相同（78e1933fa4f25ad7a0562cf47250ba3e4368cec136ac8ee0d7efd481d40a82a8），无成本表迁移。没有改生产，无提交推送。
- 回退API：API_IMAGE改回fyt-api:local，在原主仓docker compose -f deploy/staging/docker-compose.yml up -d --no-build --no-deps api。回退studio：本仓compose image改回fyt-studio:staging-project-files-20261023-v1，再仅up studio。两份旧镜像保留，不回滚DB。
- 后端重建：独立checkout执行CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -mod=readonly -ldflags "-s -w -X github.com/yckonnnnn/fytapi-go/common.Version=6239ccbf4-studio-images" -o foyton-api .；再docker build -f deploy/studio-images.Dockerfile -t fyt-api:studio-images-20261023-v1 .。本轮生成二进制已清理，源码保留。

后续优先：生成结果进入画布/本地编辑，作品历史；采购成本需供应商账户单价及成本模块另验。

## 生成图转入编辑器与原界面保留（2026-10-23 当前）

- 图片卡片新增“加入无限画布”和“本地编辑”，桌面/移动端均可用，保留下载/复制/删除。不上传、不重复生图、不额外扣费；仅允许<=10MiB的PNG/JPEG/WebP，最终解码/像素预算沿用编辑器规则。
- shell同账号内存转File，转交前检查会话revision、卸载状态，串行锁与传输ID确认防重复。画布等待active/ready/空闲后追加，保留已有节点；编辑器已有图片先确认替换，取消/导入失败保留旧内容。跨账号仍整shell重挂载，不迁入他人图片。
- 图片页新增“fyt已接入 / 原版完整界面”两视图，后者保留原模型目录和参数区，仅预览；无persistenceId，不读写旧MuAPI存储，不能生成/上传。live实例切换时保留挂载，生成结果不丢；原参数不会被忽略后混入fyt收费。
- 本地编辑恢复原完整检查器、调色控件、工具与底部输入，未接AI执行明确disabled；关闭检查器后可重新打开。本地PNG新增原暗角/胶片颗粒合成，与原导出共享colorGradingOverlays；这是review发现后补齐的缺陷。原样例CDN素材保留展示，不承诺零CDN请求，不调用MuAPI AI/上传端点。
- 目录列出全部原工具与各自接入状态。完整差异清单docs/fyt-feature-parity.md：高级媒体/原智能体/工作流/设计AI仍有界面差异，后续逐页恢复，不把保留菜单当已完成迁移。用户“尽量保持原功能和前端一点不少”成为后续验收约束。
- 68项Node检查、5个相关JSX语法检查与父子diff --check通过，四包+Next Linux构建成功；独立review复核关闭暗角/颗粒导出问题。未自动浏览器验收或新增收费请求，真实转入/替换确认/调色像素待用户体验。
- 仅studio更新为fyt-studio:staging-editors-20261023-v1（9a1e034d388b…）；上一版staging-images-20261023-v1（0925f366acfc…）保留。回退只改本仓compose studio.image并up --no-build studio，不动API/DB。API仍6777491c9537…，生产未动，无commit/push。
