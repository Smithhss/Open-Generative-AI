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
| 图片真实出图 | 预发环境 + 有效图片渠道，核对扣费与上游账单 |
| 视频真实出片 | 预发环境 + 视频渠道，跑通提交→轮询→content 下载 |
| 分组与倍率 | 确认 `/pg` 路径的 `IsPlayground` 计费在任务场景下按用户额度结算 |
| C2 导航收缩 | 待确认后执行 |
| C3 归档 fyt-validation | 待确认预发是否仍依赖 |

