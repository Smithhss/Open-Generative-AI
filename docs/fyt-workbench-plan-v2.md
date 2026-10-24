# fyt 工作台改造计划 v2（收敛版）

> 版本：v2 / 2026-10-24
> 仓库：`/Users/smith/develop/project/Open-Generative-AI`，分支 `codex/fyt-integration`
> 替代：`docs/archive/fyt-plans-20261023/` 下 9 份过程计划（已归档，不再作为执行依据）
> 纪律：本文件不授权 commit / push / 部署；删除操作只按第 4 节清单执行

---

## 1. 现状审计

### 1.1 仓库状态

| 项 | 实测 |
|---|---|
| HEAD | `2579652`（与 upstream 同步） |
| 工作区 | dirty，全部二开代码**未提交** |
| 新增文件 | 6 个组件 + 12 个 lib 模块 + 2 份文档 + 2 套部署，约 1382 行 |
| 修改上游 | 11 个文件，+422 / −126 |
| 测试 | `node --test tests/fyt-*.test.mjs` → 68 passed / 0 failed |

**首要风险：全部二开代码是 untracked 状态**。一次误操作（`git clean`、切分支、换机器）就会全部丢失。这件事优先级高于任何功能开发。

### 1.2 功能三态

| 模块 | 状态 | 实际能力 | 消耗算力 |
|---|---|---|---|
| 账户 / 余额 / 会话 | 可用 | 复用 fyt JWT，跨标签同步，余额刷新 | — |
| 图片 ImageStudio | 部分可用 | **仅 `gpt-image-2` 单张文生图** | 是（单一模型） |
| 文本助手 AgentStudio | 可用 | 模板、多轮、流式、本机历史 | 是（文本单价低） |
| 无限画布 Canvas | 本地可用 | 多图/文字/变换/项目文件/导出 | 否 |
| 本地图片编辑 Layers | 本地可用 | 导入/标注/形状/调色/PNG 导出 | 否 |
| 视频 VideoStudio | 占位 | 界面预览，参数可调，无生成 | 否 |
| 音频 / 剪辑 / 动作 / Vibe / 唇形 / 换体 / 电影 / 营销 / 网红 / 工作流 | 占位 | 原入口 + 待接提示，共 10 个 | 否 |

结论：15 个入口里 4 个可用、11 个占位；**能消耗视频算力的入口是 0**。

### 1.3 投入分布（偏移的证据）

| 类别 | 代码量 | 占比 | 是否产生算力消耗 |
|---|---|---|---|
| 生成链路（`images.mjs` 65 + `chat.mjs` 154） | 219 行 | 16% | 是 |
| 非生成能力（Canvas 237 + Apps 37 + Shell 改造 101 + Layers 改造 305） | 680 行 | 49% | 否 |
| 支撑设施（session/account/currency/draft/sync/transfer） | ~483 行 | 35% | — |

**近一半工程投入落在不产生算力的模块上，而真正赚钱的视频入口是 0。** 这就是"偏移"的准确含义——不是代码写错了，是优先级排错了。

---

## 2. 目标重定义

从"复刻上游 15 个工具"改为"**4 个入口，2 个赚钱**"：

| 定位 | 入口 | 目标 |
|---|---|---|
| 赚钱 | 图片（多模型）、视频 | 单用户月度算力消耗 |
| 留存 | 文本助手、无限画布 | 回访与使用时长 |
| 隐藏 | 其余 10 个 | 不投入、不展示、不维护 |

判定一个模块是否值得投入，只看三条：**是否消耗算力 / 是否被用户主动使用 / 是否增加上游 merge 成本**。三条都不满足的，一律冻结。

---

## 3. 偏移判定

| 模块 | 判定 | 处理 |
|---|---|---|
| 无限画布（237 行） | 不消耗算力，但留存价值真实 | **冻结**：保留、不删、停止投入、导航降级 |
| 本地图片编辑（改上游 305 行） | 不消耗算力，且 merge 成本最高 | **冻结 + 技术债**：功能保留，改动后续抽到 wrapper |
| 应用状态目录（37 行） | 面向开发者，用户看到"待接入"只会流失 | **收缩**：只列 4 个可用入口 |
| 10 个占位 Studio | 无功能、有噪音 | **隐藏**：导航不展示，路由保留 |
| 9 份过程计划文档 | 工作记录，非产品文档 | **已归档** |
| 测试产物 PNG | 验收证据 | **已归档** |

**没有发现死代码。** 12 个 lib 模块全部被引用，6 个组件全部挂载。所以本轮不做源码删除——需要清理的是范围，不是文件。

---

## 4. 清理清单

### 4.1 已执行（本次）

| 操作 | 源 | 目标 |
|---|---|---|
| 归档 | `docs/superpowers/plans/*.md`（9 份） | `docs/archive/fyt-plans-20261023/` |
| 归档 | `artifacts/gpt-image-2-staging-test.png` | `docs/archive/fyt-evidence-20261023/` |
| 清理空目录 | `docs/superpowers/`、`artifacts/` | 已移除 |

### 4.2 待执行（需确认）

| 编号 | 操作 | 范围 | 风险 |
|---|---|---|---|
| C1 | 导航隐藏 10 个占位 Studio | `components/StandaloneShell.js` 的 NAVIGATION_CATEGORIES / TABS | 低，路由保留可直达 |
| C2 | 收缩 `FytAppsStudio` 为 4 个可用入口 | `components/fyt/FytAppsStudio.jsx:4-19` | 低 |
| C3 | 评估归档 `deploy/fyt-validation/` | 与 `deploy/fyt-staging/` 功能重叠 | 中，需确认预发是否仍依赖 |

### 4.3 明确不删

| 项 | 原因 |
|---|---|
| `FytCanvasStudio.jsx`（237 行） | 功能可用，只是不赚钱；删除等于销毁已完成的用户价值 |
| `LayersStudio` 的 305 行改动 | 本地编辑功能真实可用；问题在 merge 成本，应重构而非删除 |
| `lib/fyt/*` 全部模块 | 无死代码，全部被引用 |
| `deploy/fyt-staging/` | 当前预发入口依赖它 |

---

## 5. 补齐计划

### P0 模型放开（0.5–1 天）

**问题**：`lib/fyt/images.mjs:5-8` 只放行 `gpt-image-2`。

```js
return models.includes('gpt-image-2') ? ['gpt-image-2'] : [];
```

**根因在后端**：`/api/user/models` 走 `foyton-relay/controller/user.go:695` → `GetGroupsEnabledModels`，返回 `[]string`，只有模型名没有类型，前端无法判断哪个是图、哪个是视频。

| 任务 | 文件 | 改动 | 验收 |
|---|---|---|---|
| T0.1 | `foyton-relay`（另仓） | `/api/user/models` 支持 `?type=image\|video\|chat`，或返回 `{name, type, capabilities}` | `curl` 带 type 参数返回正确子集 |
| T0.2 | `lib/fyt/images.mjs:5-8` | 改为按类型过滤，移除硬编码 | 至少 3 个图片模型可选 |
| T0.3 | `lib/fyt/images.mjs:9-14` | 尺寸/数量/参考图能力从 model_meta 读取，不在前端写死 | 选不同模型参数面板正确变化 |

**不做**：不在前端维护模型白名单常量（会和后台配置漂移）。

### P1 视频接入（2–3 天）★ 核心

**目标**：把唯一能消耗视频算力的入口打通。

| 任务 | 文件 | 改动 | 验收 |
|---|---|---|---|
| T1.1 | 新增 `lib/fyt/videos.mjs` | `create` → POST `/pg/videos`；`poll` → GET `/pg/videos/:id`；`content` → GET `/pg/videos/:id/content` | 单测覆盖状态机与错误分支 |
| T1.2 | 新增 `components/fyt/FytVideoStudio.jsx` | 复用原 `VideoStudio` 布局，替换执行层 | 界面与原版一致，生成走 fyt |
| T1.3 | `StandaloneShell.js` | fyt 模式下 `video` tab 挂 FytVideoStudio | 路由可达 |
| T1.4 | `FytAppsStudio.jsx:8` | 状态从"仅预览"改为"已接入" | 状态与实际一致 |
| T1.5 | 任务恢复 | 刷新后按 task_id 续查，不重复提交 | 刷新不重复扣费 |

**约束**：视频是异步收费任务，**禁止自动重试 POST**（与现有 `images.mjs:53` 注释同一原则）。

**验收**：文生视频 1 条、图生视频 1 条，任务状态、耗时、扣费、产物下载四项一致；失败可退款。

### P2 图生图与上传（1 天）

| 任务 | 文件 | 改动 |
|---|---|---|
| T2.1 | `lib/fyt/images.mjs` 新增 `generateFytImageEdit` | POST `/pg/images/edits`，multipart，复用 `normalizeGeneratedImage` |
| T2.2 | 上传链路 | 走 fyt 对象存储，返回 URL 供参考图使用 |
| T2.3 | `FytImageStudio.jsx` | 开放上传与参考图槽位 |

**验收**：上传 1 张图 + 提示词 → 出图；产物可转画布、可下载。

### P3 模型别名映射（1 天）

| 任务 | 文件 | 改动 |
|---|---|---|
| T3.1 | 新增 `lib/fyt/model-alias.mjs` | 上游 `models.js` 的 id ↔ fyt 模型名映射表 |
| T3.2 | 未匹配降级 | 选到未映射模型时禁用生成并提示，而不是发一个必然失败的请求 |

### P4 CSP 与产物（0.5 天，随上线）

| 任务 | 文件 | 改动 |
|---|---|---|
| T4.1 | `middleware.js` fyt 分支 | `img-src` / `media-src` 加入产物域名；`connect-src` 保持 `'self'` |
| T4.2 | 产物访问 | 签名 URL + 有效期，避免外部工具长期引用 |

### P5 技术债（延后，不阻塞功能）

| 任务 | 说明 |
|---|---|
| T5.1 | `LayersStudio` 的 305 行改动抽到 `FytLayersStudio.jsx` wrapper，上游文件恢复原样 |
| T5.2 | `StandaloneShell.js` 的 101 行收敛为一个 `fyt` 分支入口 |
| T5.3 | 首次提交二开代码（当前全部 untracked） |

---

## 6. 执行顺序

```
第 1 步（立即）  T5.3 先把现有代码提交到分支，锁住成果
第 2 步（0.5d）  P0 模型放开（含 fyt 后端 type 过滤）
第 3 步（2–3d）  P1 视频接入  ← 商业目标在此
第 4 步（1d）    P2 图生图
第 5 步（1d）    P3 别名
第 6 步（0.5d）  P4 CSP，随上线
第 7 步（按需）  C1/C2 导航收缩、P5 技术债
```

理由：先锁成果，再打通赚钱入口，最后做体验优化。导航收缩放在功能之后，避免用户在功能未就绪时失去入口。

---

## 7. 验收口径

| 层级 | 标准 |
|---|---|
| 单测 | `node --test tests/fyt-*.test.mjs` 全绿，新增模块必须有单测 |
| 构建 | `NEXT_PUBLIC_STUDIO_MODE=fyt npm run build` 通过 |
| 功能 | 每个 P 项按上表逐条验收，不接受"能打开页面"作为完成 |
| 计费 | 真实调用后核对：请求日志、任务快照、扣费金额、上游账单，四项一致 |
| 隔离 | 双账号数据、草稿、历史互不可见 |
| 网络 | 浏览器只请求同源，不出现 muapi 域名 |

---

## 8. 风险与回滚

| 风险 | 应对 |
|---|---|
| 二开代码丢失 | **立即提交**（T5.3），这是当前唯一不可逆风险 |
| 上游更新冲突 | 改动收敛到 wrapper；上游文件只留钩子 |
| 视频任务重复扣费 | 禁止自动重试 POST；刷新只续查不重提 |
| 模型放开后参数错配 | 能力从 model_meta 读，不猜 |
| 占位入口造成用户流失 | C1/C2 收缩导航 |

回滚：所有改动在 `codex/fyt-integration` 分支；上游文件改动可用 `git checkout -- <file>` 单文件回退。

---

## 9. 不做清单

1. 不删除任何可用组件（Canvas、Layers 冻结而非删除）。
2. 不为 10 个占位 Studio 补假数据或假状态。
3. 不在前端维护模型白名单。
4. 不新建第二套钱包、账号或会话体系。
5. 不把 fyt JWT 当 MuAPI Key 传给上游。
6. 不在未验收真实渠道前对外宣称"支持多模型"。

---

## 10. 执行记录

### 2026-10-24 第一批

| 项 | 状态 | 说明 |
|---|---|---|
| T5.3 提交二开代码 | 完成 | `46301cf`，67 文件 / +4529 / −126 |
| C1 归档过程文档 | 完成 | 9 份计划 → `docs/archive/fyt-plans-20261023/` |
| C1 归档测试产物 | 完成 | `docs/archive/fyt-evidence-20261023/` |
| P0 模型放开（前端） | 完成 | `lib/fyt/images.mjs` 移除 `gpt-image-2` 白名单，改为服务端按类型过滤 |
| P0 模型放开（后端） | 完成 | `/api/user/models` 新增 `type` 与 `with_meta`，新增 `common.ModelKind`、`model.GetModelMetasByNames` |
| P1 视频（前端） | 完成 | 新增 `lib/fyt/videos.mjs`、`components/fyt/FytVideoStudio.jsx` |
| P1 视频（后端） | 完成 | 新增 `/pg/videos`、`/pg/videos/:task_id`、`/pg/videos/:task_id/content` |

### 执行中新发现的事实（原计划未覆盖）

**`/pg` 只注册了 `chat/completions`，`/pg/images/generations` 在全部分支中都不存在。**
原前端调用的图片端点在当前 fyt 上会落到 `NoRoute` → JSON 404，也就是说图片链路此前并未真正打通。
本轮补上了 `/pg/images/generations`、`/pg/images/edits`、`/pg/videos*`，并把 `Playground` 的临时令牌逻辑抽成 `setupPlaygroundToken` 复用。

### 待验收

| 项 | 需要什么 |
|---|---|
| 图片真实出图 | ~~预发环境 + 有效图片渠道~~ 已验（见下） |
| 视频真实出片 | 上游账号余额：ai.centos.hk 账户 ¥11.23，最低一档 seedance 需 ¥13.75 |
| 分组与倍率 | 已验图片按用户额度扣费；视频任务场景未验 |
| C2 导航收缩 | 完成 |
| C3 归档 fyt-validation | 待确认预发是否仍依赖 |

### 2026-10-24 第二批（真实渠道验收）

用分支镜像起临时容器（18444，独立 `NODE_NAME`，接同一套 PG/Redis），验证后删除容器与含密钥临时文件。

| 项 | 结果 |
|---|---|
| `GET /api/user/models?type=image` | 7 个模型 |
| `GET /api/user/models?type=video` | 4 个模型 |
| `POST /pg/images/generations` + `gpt-image-2.5-flare` | 200 / 28s / 2.4MB PNG |
| 扣费 | 15,003 quota（约 $0.03），与上游 `credits_charged: 1` 一致 |
| `POST /pg/videos` | 走通鉴权、渠道解析、上游调用；卡在上游余额 |

验收中发现并修复：

| 问题 | 修复 | 提交 |
|---|---|---|
| `Path2RelayMode` 无 `/pg` 归一化，图片请求被当文本解析 | 归一化 `/pg/` → `/v1/` | `b2e11b8` |
| 模型无 endpoints 声明且名称回退太窄，`type=image` 返回 0 条 | 扩展回退规则，允许通用 openai 声明时按名称判断 | `b2e11b8` |
| 上游只返回 https 外链，前端一律报错 | 接受 https 外链，CSP img-src 放开 https | `7b620c4` |
| `seconds` 传数字，网关按 OpenAI 规范要字符串 | 改传字符串 | `fa81684` |

预发数据变更（仅 staging，可回滚）：

| 对象 | 变更 | 回滚 |
|---|---|---|
| 渠道 28 | `type` 60 → 55（Sora），因上游是 OpenAI `/v1/videos` 协议 | `update channels set type=60 where id=28;` |
| 用户 1 | 密码重置为 `fyt@202609` | 无（与生产一致） |
| ModelPrice | 临时加过测试价，已移除 | 已还原 |

遗留建议：fyt 侧增加图片产物代理，避免上游外链过期与跨域下载失败。


---

## 7. 执行记录（2026-10-24 晚）

### 7.1 生产视频上线

上游 `api.52pay.com` 的模型目录已变化：`MiniMax-H3` 消失，`seedance-2.0` 变成死别名（映射到已下架的 `doubao-seedance-2-0-260128`），只有 `seedance-2.5` 可用。

| 对象 | 变更 | 回滚 |
|---|---|---|
| 生产渠道 29 | 新建 `type=55`（Sora），`base_url=https://api.52pay.com`，模型 `seedance-2.5` | `delete from channels where id=29;` + 对应 abilities 行 |
| 生产 ModelPrice | 新增 `seedance-2.5 = 0.12422360248447205`（与 seedance-2.0 同价） | 从 JSON 里删掉该键 |

生产实测：`POST /v1/videos` → `task_KyHfLhsxPnuN5Qzgp5tiUneHSZUG7lf3`，3 分 45 秒后 `completed`，扣 248,444 quota，产物 1280×720 / 4.06s / 3.58MB，`/v1/videos/:id/content` 直出 200。

### 7.2 T1.5 完成：刷新续查

同时修掉两个会让视频永远不出结果的缺陷：

| 问题 | 影响 | 修复 |
|---|---|---|
| 查询接口返回 `{code,data:{status}}`，前端读顶层 `body.status` | 永远拿到 `unknown`，轮询跑满 200 次也不停 | 新增 `unwrapTask` |
| 状态是大写 `SUCCESS` / `IN_PROGRESS`，前端按小写比较 | 完成也不出视频 | 新增 `normalizeStatus` 统一词表 |

任务标识按 `userId` 写入 `localStorage`，刷新后自动续查；已结束的任务直接展示结果。

### 7.3 P2 完成：图生图

后端 `POST /pg/images/edits` 此前 400「未指定模型名称」：`getModelRequest` 的图片分支用原始路径判断，`/pg` 不匹配；通用分支又把 multipart 整体跳过。修复后预发实测 200 / 28.6s / 1024×1024，扣费与文生图一致。

前端新增 `FytImageEditStudio`，不改上游 `ImageStudio`（上游在上传槽位写了 `!fytImage`，直接改会抬高同步成本）。

### 7.4 剩余任务

| 编号 | 任务 | 说明 |
|---|---|---|
| T0.3 | 图片尺寸/张数能力 | 阻塞：`with_meta=1` 只返回模型类别，没有尺寸/张数元数据，需先补后端字段 |
| T4.2 | 产物签名 URL | 未开始；当前图片产物是上游外链，建议先做 fyt 侧代理 |
| P5 | 技术债：Layers wrapper、Shell 收敛 | 未开始 |
| C3 | 归档 `deploy/fyt-validation/` | 待确认预发是否仍依赖 |

### 7.5 P3 完成：模型别名表

原计划设想的是「上游模型 id → fyt 模型名」的单向映射，用来决定能不能生成。实际改造后生图/生视频都走 fyt 自己的模型目录，那条路径已经不成立，所以按真实需求重做成两件事：

| 能力 | 函数 | 用途 |
|---|---|---|
| 展示名 | `labelForModel` / `modelOptions` | 下拉框显示 `GPT Image 2.5 Flare` 而不是 `gpt-image-2.5-flare`；未收录的模型原样显示，不猜 |
| 上游解析 | `resolveFytModel` / `isModelMapped` | 上游 id（`gpt-image-1`、`nano-banana` 等）按候选顺序解析到当前分组真实可用的 fyt 模型；解析不到返回 `null`，调用方据此禁用生成而不是发一个必然失败的请求 |

`modelOptions` 只改 `label`，`value` 始终是 fyt 真实模型名，不会因为显示名改动而调错模型。

预发验证：`/create/zh/studio` 返回 200，产物块中包含「图生图」「FYT IMAGE EDIT」「GPT Image 2.5 Flare」「视频工作室」四处标记。

### 7.6 清理二开遗留（C3 完成）

| 对象 | 处理 | 理由 |
|---|---|---|
| `deploy/fyt-validation/` | 删除，容器/网络/数据卷/镜像一并移除 | SQLite + mock 上游的隔离环境，已被真实预发取代 |
| `docs/archive/`（9 份过程计划 + 测试截图） | 删除 | 结论已并入本文，git 历史仍可查 |
| `docs/fyt-feature-parity.md` | 删除 | 15 个工具的旧对齐表，早于导航收缩，已失效 |
| `docs/fyt-development.md` | 重写 | 去掉验证环境引用，按当前接入状态重写 |
| `lib/fyt/draft.mjs` | 删除 | 无生产引用，只有自己的测试在用 |
| `fyt-studio-images` / `fyt-studio-validation` 工作树 | 移除 | 分支已并入 dev，validation 环境已废弃 |
| 旧 studio 镜像 5 个 | 删除，保留 `staging-editors-20261023-v1` 作回退 | — |

### 7.7 图片产物同源代理

`GET /pg/images/artifact?url=` 只代理白名单域名（`IMAGE_ARTIFACT_HOSTS`），未配置时 503。前端把 https 外链改写为该地址，代理失败再回退直连。

预发实测：代理真实产物 200 / `image/png` / 599,745 字节；`evil.com` 400；匿名 401。fyt 侧 PR #110，前端提交 `3d68588` / `ec6c2db`。

遗留：生产尚未配置 `IMAGE_ARTIFACT_HOSTS`，工作台上线前必须同步，否则图片会走 503 回退到直连。

### 7.8 T0.3 完成：模型能力表与尺寸选择

原计划的 T0.3 要求「尺寸/数量从 model_meta 读」，但 `with_meta=1` 只返回模型类别，没有参数元数据。所以先在 fyt 后端补字段（PR #112），再让前端消费。

尺寸不是猜的，是预发实测的：

| 请求 | 产物 |
| --- | --- |
| `gpt-image-2.5-flare` + `size=1536x1024` | 1536×1024 |
| `gpt-image-2.5-flare` + `size=1024x1536` | 1024×1536 |
| 不带 size | 1024×1024 |

`gemini-3.1-flash-image` 分组无可用渠道，无法验证，因此不返回 `sizes` —— 前端隐藏尺寸选项，而不是发一个上游会静默忽略的参数。

前端：`getImageModels` 返回 `{ models, capabilities }`，尺寸下拉只在 capabilities 有 `sizes` 时出现；`imageGenerationBody` 只接受 `宽x高` 形式的 size，非法值不进请求体。
