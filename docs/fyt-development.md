# fyt 工作台开发

当前 fyt 模式直接复用开源 `StandaloneShell`、`ImageStudio` 和 `VideoStudio` 的布局与组件，右上角替换为 fyt 登录/账户/余额。匿名用户也可预览原版图片、视频界面和静态模型目录，目录不代表 fyt 已接入的能力。图片已接入GPT Image 2单张文生图；上传、图生图与视频生成未开放。文本助手、本地编辑与无限画布可用。

当前源码的导航为左侧分类栏；MuAPI 官网演示截图的顶部横排导航不等于当前仓库的布局。原版黑色/青色样式、示例卡片、模型选择器和提示词栏保持不变。

## 现有 fyt 预发（最新入口）

现已部署到 `http://127.0.0.1:18443/create/zh/studio`，直接复用既有fyt预发的账号、余额、PostgreSQL和Redis。工作台作为独立Next容器运行，不直接连接数据库。镜像、验收和回退说明见 [现有预发集成](../deploy/fyt-staging/README.md)。下文8080为前期隔离演示，不是这套预发。

## 启动

在仓库根目录执行：

```bash
NEXT_PUBLIC_STUDIO_MODE=fyt FYT_LOCAL_API=true WATCHPACK_POLLING=true NEXT_TELEMETRY_DISABLED=1 \
  npm run dev -- --hostname 127.0.0.1 --port 3100
```

完整本地联调请使用统一入口 `http://127.0.0.1:8080/create/zh/studio`，英文入口 `/create/studio`。3100 是 Next 开发端口，13100 是隔离 Go API；不要混用不同端口做多标签会话测试，因为 Web Lock、BroadcastChannel 和本地草稿按 origin 隔离。

### 启动统一登录入口

1. 按 [隔离环境说明](../deploy/fyt-validation/README.md) 启动 Go 环境。
2. 在独立 fyt checkout 的 `frontend` 中按锁文件安装和构建（不改 fyt 源码）：

```bash
cd ../fyt-studio-validation/frontend
npm ci --no-audit --no-fund
npm run build
```

3. 启动本仓库 Next 开发服务（见上方命令），然后从本仓库根目录启动本地 Nginx：

```bash
FYT_VALIDATION_FRONTEND_DIST="$(cd ../fyt-studio-validation/frontend/dist/client && pwd)" \
  docker compose -f deploy/fyt-validation/login-compose.yml up -d
```

Nginx 只监听 `127.0.0.1:8080`，静态文件只读挂载。`/create` 到本机 Next 3100，`/api`、`/pg`、`/v1` 到隔离 Go 13100，其他页面使用 fyt 原前端及其 `_shell.html`。`host.docker.internal` 是 Docker Desktop 的宿主机地址，不是生产地址。工作台与控制台共用原 Go 会话，不新增登录系统。

测试账号在 Obsidian 项目凭证目录的私有环境文件中，只用于隔离数据。显示的余额不是生产余额。退出后草稿仍保存在原账号的本地存储，重新登录同一账号可恢复。

停止登录入口（保留构建文件和 Go 数据）：

```bash
FYT_VALIDATION_FRONTEND_DIST="$(cd ../fyt-studio-validation/frontend/dist/client && pwd)" \
  docker compose -f deploy/fyt-validation/login-compose.yml stop
```

- `NEXT_PUBLIC_STUDIO_MODE=fyt` 是构建时配置，切换后需要重新启动/构建，不能拿同一构建产物临时切模式。
- `FYT_LOCAL_API=true` 仅供本地验证，将明确列举的账户路径代理到 `127.0.0.1:13100`；无生产地址或真实渠道默认值。
- 隔离 Go 环境启动见 [离线验证说明](../deploy/fyt-validation/README.md)。此环境与生产用户、余额无关。
- Next 的 `/login`、`/console/*`、`/_fyt/*` 开发代理仅供直接访问3100时使用；完整联调走8080统一网关，无需依赖这些代理。
- 已验收本地密码登录；OAuth、Passkey、2FA 未在此测试账号中启用，因此尚未验收。
- 不设置 fyt 模式时恢复原版 `/studio`；原版仍有自身 MuAPI Key 存储逻辑，不应在其中输入 fyt JWT。

## 部署边界

正式同源入口：`/create` 交给 Next；`/api`、`/pg`、`/v1` 交给 Go；`/login` 和 `/_fyt` 交给现有 fyt 前端。不启用本地 rewrite，不把 Next 放在生产 API 前面。当前没有修改或发布任何生产配置。

fyt 模式会在 middleware 拒绝整个 `/create/api/*`，包含原版的双 `/api`、上传、工作流和 Agent 代理；同时拒绝原版 Agent、Workflow、Assistant 页面直达，避免旧页面在服务端读取 MuAPI Cookie 并调用供应商。CSP 仅允许同源连接，浏览器不向 MuAPI 发送凭证。真实媒体接入时单独确认结果 URL/下载策略。

## 会话与数据

- `lib/fyt/{session,session-sync,refresh-runner,currency}.mjs` 由 fyt `c06146b96` 的 `frontend/src/lib/api/*.ts` 转为 JavaScript；保留源协议和共享会话名称，不增加依赖。
- JWT 仅内存；Go 签发 HttpOnly refresh Cookie。浏览器持久化只有已登录标记、无 Token 的会话通知和账户草稿。
- 余额仅读取 `/api/user/self` 和 `/api/status`。读取失败显示未知，不显示默认账户金额，不以余额差推算单笔费用。
- 原版预览的图片/视频状态分别按 `fyt:studio:image:v1:<user.id>`、`fyt:studio:video:v1:<user.id>` 自动保存在本浏览器；不迁入旧 MuAPI 历史。匿名预览只在本次页面内保持输入，切换图片/视频不清空。此前简化页面的 `fyt:studio:draft:v1:<user.id>` 草稿仍保留，不自动迁移或删除。共享设备上的本地存储不等于加密或跨用户权限边界。
- 跨标签切换账户/退出立即卸载旧账户视图，迟到的余额响应按会话 revision 丢弃。

## 验证与后续

```bash
node --test tests/fyt-*.test.mjs
NEXT_PUBLIC_STUDIO_MODE=fyt NEXT_TELEMETRY_DISABLED=1 npm run build
```

此前已完成简化页面的本地登录闭环验收。本轮原版布局已通过浏览器图片/视频切换、模型选择器、导航返回、输入保留、桌面及窄屏展示检查；原版 MuAPI 路由仍拒绝，19项会话定向检查通过。本轮未重做所有登录方式或完整生产构建。真实媒体渠道、模型参数、采购价、扣费及退款等在渠道接入后测试；不能把界面预览视为真实媒体已经接通。


## 文本助手首版（2026-10-23）

- 入口：`http://127.0.0.1:18443/create/zh/studio/agents`。保留原版侧栏和账户；新增fyt文本适配，不解锁MuAPI智能体后端。
- 四个模板、自定义角色、多轮流式、停止/手动重生成、分组模型筛选、按user.id本机历史。历史仅当前浏览器保存，上限20会话/每会话20轮，整体1MiB。
- 调用会消耗fyt额度；停止不保证上游取消或退款。不会自动重试收费POST。实扣到原控制台消费日志查询，不用余额差推算单次费用。
- 历史模型失效须重新选择，账号切换取消旧请求，401回匿名登录状态；不保存JWT或推理内容。
- 当前仅mock协议与定向检查通过、Linux构建验证；真实模型调用及页面体验需单列验收，未发起收费请求。


## 本地图片编辑与功能目录（2026-10-23）

- 编辑入口：`http://127.0.0.1:18443/create/zh/studio/layers`；目录：`/create/zh/studio/apps`。复用原LayersStudio，仅localOnly分支更改fyt行为。
- 开放PNG/JPEG/WebP本地导入、画笔/橡皮/线箭头矩形圆形、缩放/平移、曝光/对比/饱和/色相及合成PNG导出。最大10MiB，单边8192像素，总计1600万像素；撤销历史上限20步/16MiB编码数据，大图可能减少可撤销步数。
- 图片不上传、不存localStorage或数据库、不扣费。切菜单保留内存，切账号/刷新清空，离开前手动导出。不是跨设备作品库，也不是可独立移动的多图层合成器。
- 本地模式阻断全部远端AI处理handler，无默认远端样例；套索/区域AI编辑禁用，原AI侧栏替换为本地调色和导出。文字替换、AI分层/抠图/超分、设计智能体未开放。
- 新目录只显示文本助手、本地编辑、图片预览、视频预览，调用同源导航，不调用原应用兴趣API、不展示dummy应用。
- 本轮不重试浏览器权限、不绕过。真实绘图、触屏和导出像素验收需用户体验，不能用Node mock替代。


## 本地无限画布（2026-10-23）

- 入口：`http://127.0.0.1:18443/create/zh/studio/design-agent`，fyt菜单显示“无限画布”。直接复用design-agent的CanvasArea/Konva，不挂载CreativeCanvas或远端AI助手。
- 多张本地图片与文字自由摆放、缩放/旋转/层级/复制/锁定/隐藏/删除、画布平移缩放、适应全部内容、透明背景完整PNG导出；不含通用撤销重做或云保存。
- 图片导入/原生粘贴/拖入统一PNG/JPEG/WebP校验；单图10MiB、8192单边、16MP；本页累计最多20个来源图片/32MP/50MiB，最多100元素。删除后素材为内部复制保留，清空画布释放预算。
- 导出使用真实可见元素边界，包含负坐标、旋转、屏幕外元素，不含网格与选择框。PNG最大8192单边/16MP，跨度过大明确提示移动元素，不偷偷退回视口截图；适应内容不受PNG输出大小限制。
- 不允许外部URL作为图片，不开放视频/音频/任务注入；文本链接仅显示为文字。本地图片不上传、不收费、不写localStorage或DB，切账号/刷新清空；切菜单保留，隐藏时解绑全局快捷键/粘贴监听。
- 修改了Open-AI-Design-Agent子模块的CanvasArea并新增localCanvas.js，默认localOnly=false，原MuAPI模式保留。父/子仓均未提交；后续提交需先处理子模块源码与引用。
- 纯逻辑/真实Konva几何检查与Linux构建单独记录；真实浏览器操作和PNG像素仍待用户体验，不重试或绕过浏览器权限。

## 可编辑画布项目文件（2026-10-23）

- 无限画布顶部新增“保存项目 / 打开项目”，下载自包含`.fytcanvas` v1 JSON，保留原图、文字、几何、翻转偏移、层级、隐藏/锁定与视口。共享素材只存一份，删除后未引用素材不进入文件。
- 不上传、不写数据库；文件含原始图片和文字，分享文件等于分享这些素材。PNG导出是成品图，不会清除项目“未保存”状态。
- 打开前校验格式/版本/白名单/节点与素材预算，全部图片解码成功才替换；文件无效、解码失败或取消替换均保留旧画布。文件最大72MiB，其余图片预算沿用原限制。
- 内容变化提示未保存；保存期间继续编辑，生成的文件为开始保存时的快照，当前新修改仍提示未保存。视口单独移动不标脏，但保存时记录视口。
- 刷新/整页离开和当前工作台退出提供未保存提示。浏览器可能按自身策略抑制原生提示；跨标签已退出时仍优先清除身份，先保存再切账号。
- 体验顺序：导入图片/添加文字→翻转/旋转/隐藏→保存项目→清空→打开下载文件→继续编辑；再试错误JSON，确认旧画布保留。真实下载/打开及原生确认需用户页面体验，未宣称自动浏览器验收。
- 当前本机预发镜像：`fyt-studio:staging-project-files-20261023-v1`；回退可将compose studio image改回`fyt-studio:staging-canvas-20261023-v1`，再`docker compose -f deploy/fyt-staging/compose.yml up -d --no-build studio`，不动API/DB。

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
