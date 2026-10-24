# 画布 AI 接入计划

> 版本：v2 / 2026-10-24
> v2 变更：移除 Toonflow 路线（评估后不采用），只保留自家画布的最小闭环。
> 前置：工作台界面已全部回归原版；画布用上游 `DesignAgentStudio`，本地素材与项目文件已恢复（P0）。

---

## 1. 现状

| 能力 | 状态 |
|---|---|
| 画布布局与交互 | 原版 `CreativeCanvas`，不改 |
| 本地素材（拖图、导入、导出 PNG） | 已接入，素材只在浏览器 |
| `.fytcanvas` 保存 / 打开 | 已接入，纯本地文件 |
| 图片卡片「加入无限画布」 | 已接入 |
| **画布内 AI（对话 → 出图）** | **仍指向 MuAPI，fyt 下不可用** |

---

## 2. 要解决的问题

画布的 AI 面板走 `/api/v1/creative-agent/*`，这个路由现在只有 122 行，**内容是把请求原样代理到 `api.muapi.ai`**。fyt 没有这套后端，所以在 fyt 模式下点发送不会有结果。

需要实现这套协议的最小子集，让「一句话 → 出一张图贴到画布」跑通。

---

## 3. 协议子集

| 端点 | 最小实现 |
|---|---|
| `GET /sessions` | 会话列表（内存 + localStorage 持久化） |
| `POST /sessions` | 新建会话 |
| `GET /sessions/:id/messages` | 返回该会话消息 |
| `PATCH /sessions/:id/messages` | 覆盖消息（前端会主动调） |
| `POST /sessions/:id/chat` | 建 job：用 fyt 聊天模型把描述整理成图片提示词 |
| `GET /jobs/:id/events` | SSE：`queued` → `running` → `done`，`done` 带产物 URL |
| `GET /sessions/:id/jobs` | 任务列表（前端刷新后恢复用） |
| `GET /sessions/:id/assets` | 产物列表 |
| `GET /agent-skills` | 返回空数组 |

**不做**：多步编排、技能、并行任务、参考图编辑。

---

## 4. 关键约束

### 4.1 路由前缀冲突

fyt 模式的 middleware 会拒绝整个 `/create/api/*`（避免旧页面拿 MuAPI Cookie 调供应商）。画布现在请求的正是 `/api/v1/creative-agent/*`，挂在 `/create` 下会被拦。

两个选项：

| 方案 | 做法 | 代价 |
|---|---|---|
| A | 在 middleware 里放行 `/create/api/v1/creative-agent/*`，并在该路由里加 fyt 分支 | 要小心不要把其它 `/api/*` 一起放开 |
| B | 把画布的 `API` 常量改成 `/pg/creative-agent`，由 Go 网关实现 | 要改 `CreativeCanvas` 的常量，且 Go 侧要写 SSE |

**倾向 A**：改动集中在 Next 侧，Go 网关不动；放行时只匹配这一个前缀。

### 4.2 计费

出图走 `/pg/images/generations`，复用现有计费链，不新增逻辑。会话与消息不收费。

### 4.3 产物

图片产物走上游外链 → 经 `/pg/images/artifact` 同源代理（已上线），避免签名过期。

---

## 5. 分阶段

### P0 画布本地能力（已完成，2026-10-24）

`CreativeCanvas` 开透传口（`localCanvas` / `onLocalFiles` / `isLocalSource` / `onLocalClear` / `onProjectDirtyChange` / `canvasApiRef` / `toolbarExtra`），`FytCanvasStudio` 改成薄壳，工具栏插入「打开项目 / 保存项目 / 导入图片 / 导出PNG / 清空」。

### P1 画布 AI 最小闭环（已完成，2026-10-24）

| 任务 | 说明 |
|---|---|
| middleware 放行 | 只放行 `/create/api/v1/creative-agent/*` |
| fyt 分支实现 | 上面 9 个端点 |
| 意图 → 提示词 | 复用 `agent-templates` 的「提示词助手」系统提示 |
| 出图 | `/pg/images/generations`，产物经同源代理 |
| 会话持久化 | 内存 + localStorage，刷新可恢复 |

**验收**：画布右侧输入「一只在雨里的柴犬，电影感」，事件流走到 done，图片自动出现在画布上，额度正确扣减。

### P2 视需要（不排期）

- 多张图 / 局部重绘
- 参考图编辑（把画布选中元素作为输入）
- 流式输出（边想边出）

---

## 6. 风险

| 风险 | 说明 | 应对 |
|---|---|---|
| SSE 事件结构对不上 | 前端消费方式只能从 `CreativeCanvas` 源码反推 | 先做「最简事件」跑通，再逐个补字段 |
| 路由放行过宽 | 放行 `/create/api/*` 会重新暴露 MuAPI 代理 | 只匹配 `creative-agent` 这一个前缀 |
| 内存态丢失 | 服务重启会话消失 | 会话元数据存 localStorage，消息也存前端 |

---

## 7. P1 实施记录

实现文件：`lib/fyt/creative-agent.mjs`，路由 `app/api/v1/creative-agent/[[...path]]/route.js` 在 fyt 模式下分流到它。

### 7.1 与计划的偏差

| 计划 | 实际 | 原因 |
|---|---|---|
| SSE 推事件 | **轮询** `GET /jobs/:id/events?since=N` | 读前端源码发现它就是轮询，不是 SSE |
| 9 个端点 | 实现了 8 个（`run-skill` 直接拒绝） | 技能不在最小闭环内 |

事件类型对齐前端消费方式：`text`（追加到消息）、`tool_call`（生成中占位）、`tool_result`（带 `asset` 落到画布）、`error`。

### 7.2 实测（预发）

```
POST /sessions                          → {id}
POST /sessions/:id/chat                 → {job_id}
GET  /jobs/:id/events?since=0           → text → text → tool_call → tool_result, done=true
GET  /pg/images/artifact?url=...        → 200 image/png 1024×1024
```

提示词由文本模型整理，图片走 `/pg/images/generations`，额度正常扣减。

### 7.3 已知限制

- 会话与任务在模块内存里，服务重启即失效
- 只出单张图，不做多步编排与参考图编辑
- 模型渠道不通时按优先级回退，最多试三个
