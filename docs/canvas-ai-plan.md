# 画布 AI 与视频能力的接入计划

> 版本：v1 / 2026-10-24
> 前置结论：工作台界面已全部回归原版；画布现在用上游 `DesignAgentStudio`，但画布内 AI 仍指向 MuAPI，fyt 下不可用。

---

## 1. 问题定义

画布页现在有三块缺失，性质完全不同：

| 缺失 | 性质 | 依赖 |
|---|---|---|
| `.fytcanvas` 保存/打开 | 纯前端，不涉及任何 API | `CanvasArea` 已有 `getLocalProjectSnapshot` / `replaceLocalProject` |
| 「加入无限画布」按钮 | 纯前端传图 | `CanvasArea.addImage`（localOnly 下要求 blob 源） |
| 画布内 AI（对话→出图） | **需要后端协议** | 现在只是把 `/api/v1/creative-agent/*` 代理到 `api.muapi.ai`，fyt 没有这套 |

---

## 2. 三条路线

### 路线 A：自建最小闭环（在现有工作台里）

只做「一句话 → 出一张图贴到画布」，不做多步编排。

**要实现的协议子集**（Next route：`app/api/v1/creative-agent/[[...path]]/route.js` 的 fyt 分支）：

| 端点 | 最小实现 |
|---|---|
| `GET /sessions` | 内存 + localStorage 会话列表 |
| `POST /sessions` | 新建会话 |
| `GET /sessions/:id/messages` | 返回该会话消息 |
| `PATCH /sessions/:id/messages` | 覆盖消息（前端会调） |
| `POST /sessions/:id/chat` | 建 job，用 fyt `/pg/chat/completions` 把描述整理成图片提示词 |
| `GET /jobs/:id/events` | SSE：`queued` → `running` → `done`，`done` 带产物 URL |
| `GET /sessions/:id/assets` | 产物列表 |
| `GET /agent-skills` | 返回空数组（先不接技能） |
| `POST /get_upload_url` + `/upload-binary` | 改成本地 blob，不走对象存储 |

**工作量**：2–3 天（协议 300–400 行 + 事件流调试 + 画布联调）
**风险**：SSE 事件结构要按 `CreativeCanvas` 的消费方式对齐，读代码 + 试错为主
**收益**：工作台内闭环，不引入第二个应用；计费走 fyt

### 路线 B：接 Toonflow（独立应用，fyt 当供应商）

Toonflow 是 Vue3 + Bun 的短剧创作平台，**支持自定义 OpenAI 兼容的 base URL**。也就是说：

- fyt 已经有的 `/v1/chat/completions`、`/v1/images/generations`、`/v1/videos`、`/v1/models` 可以直接当它的供应商
- **不需要改 Toonflow 代码**，只需要部署 + 配一个 provider 指向 fyt + 填一个 fyt 令牌

**工作量**：0.5–1 天（Docker 部署 + provider 配置 + 一个带鉴权的反代）
**风险**：

| 风险 | 说明 |
|---|---|
| 无鉴权 | Toonflow 默认 3000 端口没有登录，必须放在带认证的反代后面 |
| 账号不打通 | 它的用户体系和 fyt 的 JWT 无关，只能用「一个共享的 fyt 令牌」跑，计费会算在同一个账号上 |
| 能力缺口 | 它要「多参考素材（首尾帧、全能参考）」，fyt 的 `/v1/videos` 目前只支持单张 `input_reference` |
| 技术栈异构 | Vue3/Bun 与 Next 工作台无法合并，只能 iframe 或独立子域 |

**收益**：拿到一整套成片级工作流（分镜、资产管理、剪辑），远超我们自建能做的范围
**代价**：它是另一个产品，不是工作台的一个页面

### 路线 C：只做视频测试

把「视频生成」单独做成一个可分享的测试入口（现有 `VideoStudio` 已经够用），不碰画布 AI。

**工作量**：0.5 天（入口 + 说明 + 限额）
**收益**：最快能让外部用户体验 fyt 的视频能力
**局限**：不解决画布页的空白

---

## 3. 建议：A + B，不做 C

理由：

1. **C 已经被覆盖**——视频工作室已经在工作台里，单独再做一个测试页是重复投入。
2. **A 是工作台的完整性**：画布页现在点 AI 没反应，这是明显的坑，必须填。最小闭环就够。
3. **B 是能力上限**：真要做短剧/漫剧，自建画布永远追不上 Toonflow 的分镜与资产管理。但它是独立产品，应该**并列存在**而不是塞进工作台。

---

## 4. 分阶段计划

### P0 恢复画布本地能力（0.5 天）

| 任务 | 改动 |
|---|---|
| 给 `CreativeCanvas` 开透传口 | `localOnly`、`onLocalFiles`、`isLocalSource`、`onLocalClear`、`onProjectDirtyChange`、`canvasApiRef`、`toolbarExtra` |
| 工具栏放「保存/打开项目」 | 复用 `localCanvasProject.js` 的 `buildCanvasProject` / `parseCanvasProject` |
| 恢复「加入无限画布」 | 图片卡片按钮 + `canvasApiRef.addImage(blobUrl)` |
| 原版上传按钮 | 从 `get_upload_url` 改走本地 blob（与上面共用） |

**验收**：拖入图片可上画布；保存得到 `.fytcanvas`；打开能还原布局与视口；图片卡片能送图进画布。

### P1 画布 AI 最小闭环（2–3 天）

| 任务 | 说明 |
|---|---|
| `creative-agent` fyt 分支 | 上面那张表的 9 个端点 |
| 意图 → 提示词 | 用 fyt 聊天模型把用户话整理成图片提示词（可复用 `agent-templates` 的「提示词助手」） |
| 出图 | `/pg/images/generations`，产物落到画布 |
| 计费与限额 | 走现有 `/pg` 计费链，不新增计费逻辑 |

**验收**：画布右侧输入「一只在雨里的柴犬，电影感」，事件流走到 done，图片自动出现在画布上，额度正确扣减。

**不做**：多步编排、技能、参考图编辑、并行任务。

### P2 接 Toonflow（0.5–1 天，独立部署）

| 任务 | 说明 |
|---|---|
| 部署 | Docker Compose，数据卷独立 |
| provider 指向 fyt | base URL + fyt 令牌，模型名用 fyt 的 `seedance-2.5` / `gpt-image-2.5-flare` |
| 鉴权 | 前面挂一层带 Basic Auth 的反代 |
| 入口 | 工作台加一个「短剧工坊」入口，外链打开（不做 iframe 嵌入） |

**验收**：在 Toonflow 里用 fyt 的模型生成一条镜头，fyt 后台能看到对应的消费记录。

### P3 视需要（不排期）

- Toonflow 与 fyt 账号打通（单点登录 + 每用户令牌）
- 多参考素材视频（fyt 侧要扩 `/v1/videos`）
- 画布 AI 从「一张图」升级为「多张 + 局部重绘」

---

## 5. 需要决策的点

| 问题 | 选项 |
|---|---|
| Toonflow 与工作台的关系 | 独立入口（推荐）／ iframe 嵌入 ／ 不接 |
| 计费归属 | 共用一个 fyt 令牌（简单）／ 每用户令牌（要改 Toonflow 的配置层） |
| 画布 AI 是否要流式输出 | 只出图（推荐，简单）／ 边想边出（要扩 SSE） |

---

## 6. 与现有计划的关系

本文替代 `fyt-workbench-plan-v2.md` 第 7.12 节里「画布 AI 依赖 MuAPI、fyt 下不可用」的遗留项，其余条目不变。

---

## 7. Toonflow 可行性验证（2026-10-24）

查了 `Smithhss/Toonflow-app`：**该 fork 与上游 `HBAI-Ltd/Toonflow-app` 完全一致，没有任何自有提交**（`upstream/master..HEAD` 为空）。所以结论按上游代码给。

### 7.1 结论：可行，而且比预想的干净

供应商不是靠配置面板填 JSON，而是 **`packages/providers/src/{language,media}/` 下的 TS 适配文件**，注册方式是 `packages/providers/index.ts` 里的一个数组：

```ts
export const languageProviders = [tfRouterLanguage, deepSeek] as const;
export const mediaProviders = [tfRouterMedia, apiMart, metaso, compshare] as const;
```

适配文件声明 `rules`（渲染成表单：API Key、请求地址）、`models`（模型清单与能力）和若干方法。**加一个 fyt 供应商 = 2 个文件 + 2 行注册。**

### 7.2 fyt 能覆盖到什么程度

| Toonflow 需要 | fyt 现状 | 结论 |
|---|---|---|
| 语言模型 | `protocol: "openai-completions"` 是内置支持的，fyt 的 `/v1/chat/completions` 直接可用 | ✅ 几乎零成本 |
| 图片生成 `text` | `/v1/images/generations` | ✅ |
| 图片生成 `singleImage` | `/v1/images/edits`（multipart） | ✅ |
| 图片 `multiReference` | 只支持单张参考图 | ❌ 暂不支持 |
| 视频 `text` / `singleImage` | `/v1/videos` + 轮询 + `/content` | ✅ |
| 视频 `startEndRequired` / `endFrameOptional` / `videoReference:N` | 只支持单张 `input_reference` | ❌ 首尾帧、多参考都缺 |
| 估价 `getPrice` | 网关有 `ModelPrice`，可以读出来返回文本 | ✅ 可选 |
| 余额 `getBalance` | `/api/user/self` 的 quota | ✅ 可选 |
| 模型清单 `modelsUrl` | `/v1/models` 返回 `{data:[...]}`，正好匹配它约定的格式 | ✅ |

### 7.3 工作量

| 任务 | 内容 | 工期 |
|---|---|---|
| `media/fyt.ts` | 声明 rules + models；实现 `generateImage`（含 edits）、`generateVideo`（提交 + 轮询 + 取产物）、可选 `getPrice`/`getBalance` | 1 天 |
| `language/fyt.ts` | 用 `protocol: "openai-completions"`，填 `apiUrl` 与模型清单 | 0.5 天 |
| 注册 + 部署 | index.ts 两行 + Docker 部署 + 鉴权反代 | 0.5 天 |

**合计 2 天**，比原估的 0.5–1 天多，因为要写适配器而不是纯配置。

### 7.4 两个必须先解决的问题

1. **多参考素材**：Toonflow 的短剧流程强依赖首尾帧与多图参考，fyt 现在只支持单张 `input_reference`。要么扩 fyt 的 `/v1/videos`，要么在适配器里降级（把多图拼成一张参考图，效果打折）。
2. **鉴权**：Toonflow 无登录，必须挂在带认证的反代后；且它内部所有用户共用一个 fyt 令牌，计费会混在一起。

### 7.5 建议

先做 fyt 供应商适配器（2 天），**只暴露 text / singleImage 两类模式**，跑通「剧本→出图→出短视频」的最小链路。等链路验证有价值，再决定要不要为 Toonflow 扩 fyt 的多参考视频能力。
