# Fyt 创作工作台接入计划

> 执行说明：本文件是代码核查后的设计与实施计划，不代表功能已实现。获得实施授权后，可使用现有 `executing-plans` 技能逐项执行；不默认提交、推送、部署或调用收费生成接口。

**Goal:** 让 fyt 用户在独立创作工作台使用已验证的图片模型，复用 fyt 身份、渠道和计费，之后扩展图生图与视频。

**Architecture:** 两个独立仓库、同源分工。工作台负责交互，Go 负责鉴权、可用模型、生成、结算和业务记录。先用专用测试 Key 验证协议，再以登录会话接入正式入口；不建立共享平台 Key 或第二套钱包。

**Tech Stack:** 工作台 Next.js 15 / React 19 / npm workspaces；fyt Go / Gin / GORM、既有 JWT 会话与任务插件；保留现有依赖版本。

## 0. 核查基线与边界

核查日期：2026-10-23（Asia/Shanghai）。

| 项目 | 基线 |
|---|---|
| 工作台 | `/Users/smith/develop/project/Open-Generative-AI`，`codex/fyt-integration`，`2579652f1507f392520425f8ec484b739582f0b1` |
| fyt 本地 | `/Users/smith/develop/project/foyton-relay`，`codex/latest-dev-20261022`，`6239ccbf42af843034c011b0198c588348e70147` |
| fyt 远端 dev | 查询时为 `c06146b96e9fcb0b0251f5c6caf014f00f327c40`，比本地多 6 个提交 |
| 最新变更 | PR #77 已合并经营统计；PR #78 已合并 MiniMax-H3 插件。远端受影响文件已通过 GitHub API 读取，未修改本地 fyt |
| 生产 | 上一轮 SSH 实测镜像 `v2026.10.15` healthy；标签解析到 `533af94911697c106f02f35415b82b0ce9f6a084`，不能将其等同最新 dev |
| 公网能力 | 匿名 GET `/api/pricing` 返回 15 个模型，`supported_endpoint` 仅声明 `/v1/chat/completions`；这不证明后台不存在其他渠道 |
| 本地运行 | 原版 `http://127.0.0.1:3100/zh/studio` 已显示 MuAPI Key 门禁；四个 workspace 子包已构建 |

核查覆盖网页 shell、认证、图片及视频客户端、模型目录/能力、上传代理、历史持久化；fyt 会话/路由/分发/图片适配/计费/任务/产物/定价/前端会话和 Nginx 配置。不是逐行审计整个多模块仓库，也未实调验证生产渠道、付费生成、生产登录或账单准确性。

**阶段 1 后续实测更新：** 生产配置只读盘点已完成，见 [阶段 1 能力确认](2026-10-23-phase1-capability-audit.md)。15 条渠道仅 #12/#21 启用，15 个对外模型均映射到字节 DeepSeek Flash；图片/视频候选均停用。`task_plugins` 无数据库覆盖记录不代表没有编译内置插件，`tasks` 无历史。此库没有新成本表，本地无运行中的 fyt 预发容器及实际 `.env`。首个真实图片模型尚未通过能力验收，Task 0 不视为全部完成；采购路线与测试预算确认前可继续本地会话和 mock 协议工作，不启用生产候选渠道。 用户随后选定评估现有 gpt-image-2-1k；本地离线预发已建立并通过钱包扣费/失败退款验证，供应商认证模型目录查询HTTP200但未列出该1k别名。详见能力报告第9节，真实模型能力仍未放行。

## 本轮实施调整（2026-10-23）

**全功能后续路线：** 用户要求规划所有可做模块，新增 [全功能接入计划](2026-10-23-fyt-feature-roadmap.md)：先文本助手和本地编辑，再持久化/文本工作流；媒体渠道就绪后独立推进图片、视频、音频，最后按模块接组合创作与设计智能体。本轮仅规划，未授权执行全部模块。

**现有预发集成补充：** 用户授权按“接现有预发→基础功能验收→渠道接入后媒体联调”执行。已完成工作台Linux镜像/standalone打包、独立容器、18443/create同源路由及回退备份；既有后端镜像和7项无关源码改动保持不变。管理员登录/余额/草稿/刷新/跨应用退出和工作台停机隔离验收通过。专用普通账号studioqa_pre经用户明确授权创建，凭证已存Obsidian；双账号草稿隔离于2026-10-23由用户亲验通过（非代理自动浏览器验收），账号切换恢复各自草稿。前两步已完成；第三步媒体真实渠道仍后置。详见 deploy/fyt-staging/README.md。

**原版 UI 调整补充：** 用户明确要求沿用开源布局。当前 FytShell 仅包装身份/账户控件，直接复用原 StandaloneShell、ImageStudio、VideoStudio，不再展示先前简化布局。保留静态模型目录仅供预览，生成/上传/绘制关闭，其他工具保留导航并提示未接入。图片/视频保持挂载，切换不丢输入；登录后原版状态按稳定user.id隔离，匿名只保留页面内状态。原方案“另建最小创作UI”的部分由用户最新要求替代，真实媒体数据层仍未接通。

用户明确要求：图片和视频渠道暂未添加，先实现不依赖上游的代码，真实渠道测试在接入后进行。因此不再把 Task 0 的真实图片验收作为账户基础的前置条件；媒体生成与渠道配置继续延期，不启用生产、不收费联调。

- 已实施：Task 3 的最小会话、共享刷新锁/跨标签通知、Go 余额展示、按用户 ID 保存提示词草稿；新增独立 FytShell，中英文 /create 入口。
- 已实施：Task 4 的 basePath、明确本地账户代理、原版 MuAPI API/Agent/Workflow 页面在 fyt 模式关闭。未交付正式网关或容器镜像。
- 已验证：19 项会话/金额/隔离检查通过；页面 HTTP200；原版代理和不支持页面 HTTP404；未登录浏览器空态正常。
- 本地登录闭环后续已完成：独立 fyt checkout 前端按锁文件安装/构建，新增只读静态前端及统一 Nginx 8080入口；密码登录自动回跳、余额、刷新后会话与草稿恢复、控制台钱包同额、控制台退出后工作台跨标签清空均经浏览器验证。未改 fyt 源码、数据库或生产。OAuth/2FA/Passkey未验收；图片入口、生成 UI、模型能力、真实计费/退款、媒体成本仍未交付。
- 启动方式、边界和测试说明见 [fyt 开发说明](../../fyt-development.md)。所有变更仍未提交、推送或部署。

## 1. 全局约束

- 初次核查只新增计划文档；用户后续已授权上述账户基础实现，不安装新依赖，不动生产配置。
- 实施前重新检查两仓及子模块状态；保护 Claude 或用户的现有变更，不自动切分支、stash、reset、rebase。
- 与 Claude 的成本任务按接口协作；不能以旧本地基线重做采购价、成本表或经营统计。
- 不把用户 JWT、API Key、上游 Key 写进源码、URL、localStorage、sessionStorage、可读 Cookie 或日志。
- 正式工作台不签发用户 API Key，不设共享平台 Key，不维护独立余额。
- Go 是价格、权限、资金、退款的权威；Next 不连业务数据库、不计算入账或自行扣款。
- 不把 DeepSeek 的文字模型配置成图片/视频能力，不把 MuAPI 目录直接认作 fyt 可用目录。
- 收费测试必须有明确环境、渠道、测试账号和预算；本计划未执行真实生成。
- 生产/CI/CD/DNS 变更、发布和提交推送遵循用户既有授权规则，实施本计划不自动包含这些权限。
- 涉及数据库行为时，必须真实 SQLite/MySQL/PostgreSQL 验证；迁移覆盖新库、旧版升级及重复启动。更改 relaykit 时独立 `GOWORK=off go build ./...`。

## 2. 已核实的代码事实与计划修正

### 2.1 工作台端

| 事实 | 证据 | 对设计的影响 |
|---|---|---|
| Shell 强依赖 `apiKey`，没有 Key 就返回门禁；给各 Studio 透传 Key | `components/StandaloneShell.js:574,678,979` | 正式接入不能把 JWT 冒充 apiKey；使用独立 FytShell |
| Key 同时写 localStorage 与 `document.cookie`，Cookie 非 HttpOnly | 同文件 `:579,588` | fyt 模式禁止执行这些路径；POC Key 也只保存在内存 |
| Axios 拦截器根据 URL 字符串判断注入 Key | 同文件 `:608` | 不沿用全局拦截器；只向固定同源允许路径发送凭证 |
| `/api` 为客户端 BASE_URL，又拼 `/api/v1` | `packages/studio/src/muapi.js:16,64`；`app/api/api/v1/[[...path]]/route.js` | 有双 `/api` 兼容路由；不能全局替换域名 |
| MuAPI 提交返回 request_id 后轮询 predictions | `packages/studio/src/utils/generationLifecycle.js:31` | fyt 同步图片不使用该轮询；异步任务独立适配 |
| 模型选择依赖静态 models + modelFamilies，参数为 MuAPI schema | `packages/studio/src/components/ImageStudio.jsx:14,29,989` | 首版另建小型 FytImageStudio，复用 prompt 控件，不重构整个大组件 |
| 批量是多个请求的 Promise.all，结果只读 res.url | 同文件 `:1387,1429` | 部分成功会被 catch 遮蔽，且不支持直接消费 fyt data[]；首版只生成 1 张 |
| 草稿/历史按 apiKey 的短哈希区分；迁移会接收旧共享历史 | `packages/studio/src/persistKey.js:6,18` | JWT 轮换不能作历史身份；改用服务端 user.id；不迁移无法归属的旧历史 |
| 图片下载先 fetch 外部 URL，再 fallback 打开新页 | `ImageStudio.jsx:66` | 原 CSP connect-src 仅允许 MuAPI 及同源，fyt 结果域名可能被拦；按输出类型限定允许域或使用受控代理 |
| 上传 URL、文件上传、余额、云历史、删除都为 MuAPI 专用接口 | `muapi.js:369,425,957,981`；`app/api/v1/get_upload_url/route.js:3` | 首版关闭上传/云历史删除等入口，不能把它们原样转发到 fyt |

### 2.2 fyt 端

| 事实 | 证据 | 对设计的影响 |
|---|---|---|
| 用户会话与模型 API Key 是两条认证链 | `middleware/auth.go:47,244,350` | TokenOrUserAuth 只识别身份，不自动构造生成所需上下文 |
| 现有 /pg 只有聊天，会建立无持久 Key 的临时 token 上下文 | `router/relay-router.go:64`；`controller/playground.go:17` | 在 /pg 扩展图片会话入口，而非让 Next 存平台 Key |
| /pg 标记决定跳过 API Key 限额扣减 | `relay/common/relay_info.go:545`；`service/quota.go:395` | 入口路径和上下文必须一起验证；不能简单新增 /api/studio 后直接 Relay |
| 分发和 relay mode 多处检查真实请求路径 | `middleware/distributor.go:512`；`relay/constant/relay_mode.go:54` | /pg 图片必须显式准备正确 mode，并验证规范化 RequestURLPath；禁止全局篡改 URL 绕过鉴权 |
| ConcurrencyLimit 同时按用户 ID 与 token_id 限制 | `middleware/concurrency-limit.go:90` | 会话模式 token_id=0，直接复用会让所有用户共享 token:0 槽；需仅对明确认证的会话入口跳过 token 维度 |
| 图片走原 ImageHelper，再复用 PostTextConsumeQuota | `relay/image_handler.go:25,145` | 保留原渠道、倍率、预扣/结算；没有独立图片钱包 |
| ImageRequest.Extra 虽接收未知字段，MarshalJSON 不合回 | `relaykit/dto/openai_image.go:42,74` | MuAPI 的 resolution/images_list 等字段不能假设透传有效 |
| 字节图片适配明确支持 generations；edits 表单逻辑是注释 | `relay/channel/volcengine/adaptor.go:104` | 图生图先核对所选模型是否用 generations 的 image 字段；不默认走 /images/edits |
| 通用任务提交、用户历史、产物接口已经存在 | `router/task-router.go:14`；`router/api-router.go:415` | 视频阶段复用 Task 和插件，不新建第二套视频任务引擎 |
| 任务状态为 NOT_START/SUBMITTED/QUEUED/IN_PROGRESS/SUCCESS/FAILURE/UNKNOWN | `model/task.go:37` | 不能直接交给 MuAPI 状态解析器 |
| 已有用户任务归属查询、产物代理及 capability URL | `controller/task.go:37,66,79,233`；`service/task_artifact_access.go:32,98` | 可复用；URL 是长期 bearer capability，不是登录后才可看的短期私有链接 |
| 产物持久化目前固定 disabled 实现 | `service/task_artifact_store.go:59` | 有下载代理不等于已经永久保存作品；跨设备作品库是独立阶段 |
| RequestId 每次由服务端新建 | `middleware/request-id.go:10` | 请求号不是客户端幂等键；账务记录按请求去重不等于重复生成被去重 |
| 已有登录回跳校验及跨应用整页跳转 | `frontend/src/lib/auth/redirect.ts:18`；`frontend/src/components/auth/auth-form.tsx:114` | 复用 /login?redirect=...；无需另写认证系统 |
| /api/models 返回各渠道类型目录，非用户实际可用模型 | `controller/model.go:325` | 优先 /api/user/models?group=<用户允许组> 与定价/端点信息的交集 |

### 2.3 远端成本功能已合并，媒体口径仍需补齐

远端 `c06146b96` 已有 `model/upstream_cost_price.go`、`model/request_cost.go`、`service/request_cost.go`、`controller/business_stats.go`。采购键为**渠道类型 + 上游模型**，不是每条渠道 ID；成本以人民币微元和每百万 Token 单价计算，折扣用基点。请求表保存用户/请求/模型/采购快照，`GiftQuotaUsed` 字段存在不等于赠券消耗追踪已完成。

远端 `service/text_quota.go:577` 调用 `recordRequestCost`；后者按 input/cache/output tokens 计算。图片 `ImageHelper` 在部分无用量响应中会用 1 个 Token 作为既有结算占位。因此不得把这条成本记录当作按张采购成本；异步视频也不能假定已经纳入该 Token 成本表。

本接入不重做经营统计。媒体正式收费发布前，与成本维护者确认按张/秒/分辨率计费的表示和未知成本状态；未覆盖时必须排除误算或明确待核算，不能把占位 1 Token 当真实成本、不能按零成本显示利润。

## 3. 推荐形态与部署边界

### 3.1 路由与同源

- 正式建议 Next 配置 `basePath: '/create'`，页面为 `/create/studio` 与 `/create/zh/studio`，资源使用其 basePath 下的 `/_next` 路径；不是只给 Nginx 增加 `/studio` location。
- 同源 Nginx 只将 `/create` 及 `/create/` 交给独立 Next 进程；`/api`、`/pg`、`/v1` 仍交给 Go；fyt `/_fyt/` 不动。
- 修改 `lib/locales.js`/Shell 时明确处理 Next Link 自动 basePath、原生 history/anchor 的差异，不能重复加前缀；根路由 redirect 需浏览器验证。
- 本地 Next 的固定 rewrite 只代理已列出的账户/会话/生成路径到本地 Go `127.0.0.1:13000`，无线上地址默认值。登录页面及 OAuth 回跳用本地统一反代同时接 fyt 前端 8080 与工作台 3100；不能假设仅代理 refresh 就有完整本地登录页面。
- Next 原有 `/api/*` MuAPI 代理、各 catch-all、上传代理在 fyt 模式统一拒绝，不允许 JWT/Key 误发外部；仅隐藏菜单不足以关闭入口。basePath 下这些处理器也必须被关闭。
- CSP 保留同源优先；只按已核实输出域或受控下载路径补齐 img/media/connect，不能设置全域 connect 白名单。
- 默认本地开发，生产构建在本机/受控构建环境。现有 Dockerfile runner 只复制 node_modules 与 .next，workspace symlink 和 Next 配置/trace 完整性未验证；正式镜像需要打包所有 traced workspace 资源或 standalone 产物并冷启动验证。

### 3.2 客户端与会话

- 新建 FytShell，保留原版 StandaloneShell 以便同步上游；显式选择运行模式，不能在 fyt 请求失败后自动回退 MuAPI。
- 新建 FytImageStudio，复用现有 `prompt/PromptComposer.jsx` 等控件及双语文案风格，不给 1900 行 ImageStudio 做无关重构。
- POC 的专用个人测试 Key 只放内存，刷新即失效；只向固定本地 fyt 代理允许路径发送。不能用测试 Key 模式发布给普通用户。
- 正式模式使用 fyt 会话。Access Token 内存存储，refresh Cookie 由 Go 签发；保持 Web Lock `foyton-api:auth-refresh`、BroadcastChannel `foyton-api:auth-session`、storage event `foyton-api:auth-session:event`，处理 409 race/mismatch、401/403、429、5xx。
- 在计划锁定的 fyt 基线复制最小框架无关会话/刷新/事件/金额模块到工作台适配目录，记录来源 SHA，带同契约测试；不创建跨仓绝对路径软链或直接依赖邻居仓源码，不先抽公共包。
- 所有认证 fetch 固定同源路径；仅对明确未进入生成的认证失败允许恢复后重试。网络超时/5xx/响应丢失不自动重发收费 POST。
- 本地草稿/结果按稳定 user.id 隔离；切换账号立即清空当前视图，旧请求迟到不得写进新账号。撤销登录通过会话同步清理；不按 JWT 内容哈希隔离。

### 3.3 正式 Go 入口（建议新增，不是现有能力）

首版新增 `POST /pg/images/generations`：

1. 会话鉴权，拒绝 dashboard PAT/relay Key 作为会话凭证；检查用户有效。
2. 初始化用户缓存、临时生成上下文和 ImageGenerations mode；不持久化 token，token_id=0。
3. 仅允许经过核实的图片模型与参数，不允许客户端指定渠道、用户 ID 或采购模型。
4. 用户限流/并发、请求体限制、渠道分发、原 Relay(OpenAIImage) 与原 BillingSession；token_id=0 不共享令牌并发槽，原 API Key 路径行为不变。
5. 返回原图片 data[]，保留服务器 `X-Oneapi-Request-Id`；不伪造 task_id 或扣款金额。
6. 首版不自动赋予图片免费体验资格，不改变钱包/订阅扣款偏好；测试两种资金路径和合法回退。

收费请求、日志和成本共享同一 request_id。首版完成后刷新 /api/user/self 获取余额；余额前后差会受并发影响，不能用它推断单次扣费。没有关联日志查询结果时只展示“余额已刷新”，不显示猜测的单次金额。

## 4. 首版协议与能力清单

### 4.1 客户端内部接口

```js
// 仅作工作台内部数据契约，不替代 Go API，也不是当前已存在的实现。
// token 由 transport 闭包内存持有，UI 不接收原始凭证。
// generateImage 返回每张图的结果，禁止压成一个 res.url。
generateImage({ model, prompt, size, quality, signal })
// -> Promise<{ requestId: string|null,
//      images: Array<{ kind:'url'|'base64', value:string, mimeType:string|null }> }>
getAccount()
// -> Promise<{ userId:number, username:string, quota:number, currencyConfig:object }>
getImageModels()
// -> Promise<Array<{ id:string, displayName:string, sizes:string[],
//      qualities:string[], supportsReference:boolean }>>
```

- 第一版 `n=1`、`stream=false`；不发送 width/height/aspect_ratio/resolution 等未核实字段。size/quality 按选中模型能力映射，不做跨供应商通用猜测。
- `data` 对象/数组响应按真实适配器契约归一；支持 URL、b64_json 和多图结果，未知格式报协议错误。
- base64 的 MIME/格式必须由响应或已确认 output_format 推导；未知格式不默认当 PNG。Blob URL 仅会话展示，用后释放，不写持久草稿。
- 不修改原模型目录所有条目。可用图片模型 = 用户可用模型 ∩ 图片端点能力 ∩ 本工作台已验证参数清单；无交集时展示空态，不选文本模型兜底。
- `/api/pricing` 的 `display.final` 是展示折扣后的价格，不保证等于真实扣费；没有后端实际报价接口前只标“参考价格”，不能称为最终估价。
- 模型 endpoint 类型不足以推导完整参数；首版核实一个具体模型，后续逐个扩展小型能力清单。

### 4.2 现有任务接口（视频阶段）

| 能力 | 现有接口 | 注意 |
|---|---|---|
| API Key 提交 | POST `/v1/tasks/:key` 或插件绑定协议 | key 是插件键，不是模型 ID；不能从用户输入构造任意外部 URL |
| API Key 查询 | GET `/v1/tasks/:key` | 此时 key 是公共 task_id，响应为 status/progress 等，不含完整作品列表 |
| 用户历史 | GET `/api/task/self` | Go envelope 分页；按 task_id/status 等过滤 |
| 用户产物 | GET `/api/task/:task_id/artifacts` | 返回 capability content_url，可供 img/video 加载 |
| 内容 | GET/HEAD `/v1/tasks/:task_id/artifacts/:artifact_key/content?access=...` | 长期持有链接可访问，不能宣传为短期私有存储 |

视频正式会话提交入口是单独交付，必须核对插件处理对路径、TokenId、定价、产物和退款的依赖，不能机械复制同步图片 handler。

## 5. 分阶段实施任务与验收

### Task 0：锁定基线与首个真实图片模型（前置门）

**涉及：** 两仓 Git 状态；本计划；fyt 定价/用户模型接口；所选渠道配置的非敏感字段。

- [ ] 检查最新 dev 与 Claude 正在工作的分支；经既有拉取授权安全获取最新远端，使用独立集成分支，不改 Claude 工作区。
- [ ] 将 PR #77 后成本实现及生产/测试版本差异更新到计划。保留原 dev 两个本地独有文档提交。
- [ ] 只读确认渠道启用、用户分组、模型名、实际上游、图片端点、参数、价格、测试账号与额度。优先核实 Seedream，不预设已经配置成功。
- [ ] 如果没有图片渠道，停在“原版可运行、协议可 mock 验证”；由用户确认采购渠道/费用后再配置外部服务。
- [ ] 记录真实请求/响应脱敏样例和收费测试预算，不能放任何 Key、生产 Cookie 或个人素材。

**通过条件：** 至少一个明确图片模型及有效参数、计费模式、测试环境；否则不能宣布接通。

### Task 1：本地图片协议验证（可独立交付）

**新增：** `lib/fyt/image-response.mjs`、`lib/fyt/image-client.mjs`、`lib/fyt/image-models.mjs`、`components/fyt/FytImageStudio.jsx`、`components/fyt/FytShell.jsx`、`tests/fyt-image-response.test.mjs`、`tests/fyt-image-client.test.mjs`。

**修改：** `app/studio/[[...slug]]/page.js`、`app/zh/studio/[[...slug]]/page.js`、`next.config.mjs`、`middleware.js`；已有 MuAPI API 处理器增加模式关闭，不重写子模块。

**Consumes:** Task 0 的已核实模型能力和本地 Go 目标。
**Produces:** 第 4.1 节 generateImage 契约、可选择的真实图片模型、可下载的本次结果。

- [ ] 先写真实协议归一回归：URL data[]、b64、data 对象（若实际适配器支持）、空结果、错误 JSON、非 JSON、保留 request_id 响应头、多图不丢。
- [ ] 以 fetch mock 断言：只调用本地允许生成路径、Bearer Key 仅内存、不请求 MuAPI；网络断开/5xx 不重发收费 POST。
- [ ] 最小实现 FytImageStudio：提示词、一个模型、有效 size/quality、单张生成、loading/error/result/download。复用 prompt 控件，首版隐藏上传/视频/工作流/Agent。
- [ ] 模型空列表显示明确空态，不从静态 MuAPI 全量目录兜底。原 StandaloneShell 不作为 fyt 页面认证层。
- [ ] 用固定测试 Key（内存）和隔离渠道完成一次预算内生成；对照 Go 日志及资金变化，验证不双扣。未授权收费时只完成 mock 契约，不替代真实接通验收。

**命令：** `node --test tests/fyt-image-*.test.mjs`；`npm run build:packages`；`WATCHPACK_POLLING=true NEXT_TELEMETRY_DISABLED=1 npm run dev -- --hostname 127.0.0.1 --port 3100`。
**预期：** 契约测试通过，浏览器真实结果可见；报告 mock 与真实验证的边界。

### Task 2：fyt 用户会话图片入口（Go 独立交付）

**新增：** `controller/studio.go`、`controller/studio_test.go`、`router/studio_router_test.go`。
**修改：** `router/relay-router.go`、`middleware/distributor.go`、`middleware/concurrency-limit.go`、对应现有测试、`frontend/docs/go-api-contract.md`。必要时在 `relay/common/relay_info.go` 补最小模式映射；只有实际需要时修改，不能预先重构。

**Consumes:** 既有 UserAuth / user cache / Relay(OpenAIImage) / BillingSession。
**Produces:** `POST /pg/images/generations` 会话接口，不改变 `/v1/images/generations`。

- [ ] 回归先验证：匿名401、PAT拒绝、禁用用户拒绝、普通登录可用、客户端伪造user/channel不生效、模型/组权限受限。
- [ ] 按第 3.3 节准备上下文，token_id=0 只在明确通过会话认证的调用中免除 Key 额度检查；不放宽 TokenAuth。
- [ ] 两用户并发不能共享 token:0 槽；同用户仍受用户并发/模型限流，原 API Key 并发继续有效。
- [ ] 模型/size/quality/n/body 边界必须在发上游前校验；沿用 MaxImageN，上层首版只允许 n=1。
- [ ] 钱包和订阅分别验证预扣、成功结算、上游失败退款、余额不足不发上游，记录资金来源和request_id；不新增赠券会计逻辑。
- [ ] 未收到响应不能承诺“没扣费”；不引入客户端自动收费重试。图片首版没有服务端持久幂等保证，需要如实标注。

**定向命令：** `go test -p 2 ./controller ./router ./middleware -run 'Studio|Concurrency|Playground' -count=1`；必要的计费路径用现有测试和新增真实数据库 fixture 验证。
**发布前：** 用户亲验后执行项目完整 Go/frontend 检查；数据库影响按全局矩阵执行，不用 mock 代替三库。

### Task 3：网页登录、余额、身份隔离（工作台正式交付）

**新增：** `lib/fyt/session.mjs`、`lib/fyt/refresh-runner.mjs`、`lib/fyt/session-sync.mjs`、`lib/fyt/currency.mjs`、`tests/fyt-session.test.mjs`；为 node:test 将纯逻辑模块按项目可运行方式组织，不能假定旧 CommonJS tests 能直接 import 任意 JSX。
**修改：** FytShell/FytImageStudio、Next 固定本地代理配置、必要的路由前缀处理。

**Consumes:** fyt 刷新协议、`/api/user/self`、`/api/status`、Task 2 图片入口。
**Produces:** 无手填 Key 的已登录用户工作台。

- [ ] 从锁定 fyt 基线移植最小会话协议，标来源 SHA；源文件为 TypeScript，移植为当前工作台可直接使用的 JavaScript/.mjs 和 JSDoc，不为此新增 TypeScript 依赖。保留共享锁和事件名，JWT 仅内存。
- [ ] 覆盖 refresh race/mismatch、临时错误保持状态、多标签退出、账号切换和迟到响应隔离；JWT 轮换不改变草稿 identity。
- [ ] 登录跳转只使用校验后的同源 `/login?redirect=...`；回工作台整页导航；禁止把凭证放回跳 URL。
- [ ] 余额读取 Go quota + status 展示币种；成功后刷新，未知/失败显示“—”或明确错误，不把余额差当单次扣款。
- [ ] fyt 模式无 localStorage/可读 Cookie 凭证、无 MuAPI 余额/上传/历史请求；所有原代理按模式关闭。
- [ ] 保留少量账号隔离草稿和本会话结果，明确不是跨设备作品库。旧 MuAPI 共享历史不迁入 fyt。

**浏览器验收：** 未登录→本地登录→回工作台；刷新登录有效；退出另一标签生效；A生成中切B不会串图；JWT过期恢复；费用页面无伪造数字。

### Task 4：同源预发与亲验（不等于生产部署授权）

**拟修改：** 工作台 `next.config.mjs`、`Dockerfile`、`docker-compose.yml`；fyt `deploy/staging/nginx/variants/stage7.conf` 与部署说明。生产配置按现有 render/check 流程生成，不能直接手改线上文件。

- [ ] 本地统一入口将 /create 交给 Next、/login与/_fyt交给fyt前端、/api与/pg交给Go。验证 Next basePath、页面刷新、字体/图片资源、登录回跳和CSP。
- [ ] Docker 改用现有锁文件安装，网页镜像跳过 Electron 二进制，保证 workspace 构建资源与 Next 配置进入镜像；不能只因 dev 可用就认为 runner 可用。
- [ ] 干净容器中运行 build/start 验证，不能依赖宿主机 node_modules；不在2核生产机现场编译。
- [ ] 给用户本地/隔离预发地址亲验；保留原 fyt 页面和回退路径。用户满意后再完整测试、按授权提交/发布。
- [ ] 若首次正式上线媒体采购成本仍缺口，后台标待核算或暂不纳入毛利；与成本维护者确认后才宣称成本闭环。

### Task 5：图生图与上传（独立后续计划）

- [ ] 根据真实渠道选择 generations 的 image/JSON、edits multipart 或插件协议，不能复制 MuAPI images_list。
- [ ] 优先浏览器直接提交受限文件/数据到现有受支持图片协议，避免先建上传平台；如模型必须可公网访问URL，则单独实现所有者隔离的素材存储。
- [ ] 确定尺寸/数量/字节上限、MIME与实际内容、允许访问协议、SSRF边界、保留期和删除语义；头像上传不能当通用素材上传。
- [ ] 文件引用必须有用户归属，外部上传 URL/下载代理只允许既有安全校验后的目标，不能新建任意URL代理。

### Task 6：视频与云作品库（分别出后续实施计划）

- [ ] 视频复用 Task/插件、用户历史和产物；将大写状态归一，未知状态保留可查询，轮询停止不等于任务取消或退款。
- [ ] 将 public task_id 与上游 task_id 分离；读取/产物查用户归属，遵循 capability 的真实保密范围。
- [ ] 持久任务提交的重试幂等需要单独设计用户+操作+幂等键及请求体摘要、处理中/完成/未知结果恢复；现有 RequestId 与账表 unique 不足以解决，不先承诺 exactly-once。
- [ ] 复用 task billing/polling 的结算退款，确认是否含TokenId=0会话任务，以及重复终态处理保护；不在Next定时器里补退款。
- [ ] 同步图片没有持久 Task 记录，不能直接用 /api/task/self 得到图片作品库。跨设备图片历史须扩展既有模型或新增最小记录，并明确业务必要性与三库迁移验证。
- [ ] 产物存储实现目前disabled；若需要永久作品库，另定对象存储、访问控制、保留期、删除和成本。不能宣传已有永久存储或保证上游URL永久有效。

## 6. 关键验收矩阵

| 场景 | 必须验证 |
|---|---|
| 未登录、撤销会话、禁用用户 | 拒绝调用，无上游请求、无扣款 |
| 用户模型列表为空 | 空态；不调用聊天模型、不显示MuAPI假可用模型 |
| 正常生成 | 请求模型/参数正确，所有返回图可见，有request_id，Go只结算一次 |
| 同步响应 URL/Base64/多图 | 完整显示，下载符合CSP，Blob回收，未知格式明确失败 |
| 无余额、无权限、无渠道 | 保留具体错误；403不一概当作登录失效 |
| 上游失败与网络丢响应 | 验证真实预扣/退款；未知结果不自动重发或声称已退 |
| 切换账号/JWT轮换 | 不串历史、不被旧请求覆盖，轮换不丢归属 |
| 多标签刷新/退出 | 不互相打乱Refresh Cookie，不持续无效刷新 |
| 并发 | 用户之间不共享token:0限制；原API Key限制不回归 |
| 成本与售价 | 展示折扣价不冒充实扣价，Token占位不当媒体成本 |
| 部署路由 | /create及其静态资源完整，fyt /api、/pg、/v1、/_fyt无冲突 |
| 外部数据流 | fyt模式请求不携带凭证到MuAPI或任意绝对URL |

## 7. 明确暂不做与当前待确认事实

- 第一版不做：视频/音频/工作流/Agent/MCP/本地推理/完整素材库/跨设备图片历史/自动失败重试/新支付系统/新成本后台。
- 待核实事实：首个图片渠道与模型、实际参数和定价；隔离测试环境及预算；Claude最新成本版本对图片的排除/核算方式。
- 同源 /create 是本计划推荐默认，不是已部署路由；用户若要求独立域名，必须重评 Cookie Origin、刷新共享与登录方案，不能直接照搬同源方案。
- 即使只有匿名公开模型目录没有图片，也只能说“尚未确认图片能力”，不能推断生产完全没有配置。
- 本文不触发实施；后续先完成 Task 0，再逐个交付 Task 1–4，Task 5–6另定范围。
