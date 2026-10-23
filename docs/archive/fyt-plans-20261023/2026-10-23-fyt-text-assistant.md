# fyt 文本助手首版 Implementation Plan

> 执行时使用 executing-plans 逐任务推进，在当前会话顺序实施。保留已有未提交改动，不自动提交、推送或生产部署。

**Goal:** 在原版侧栏和黑青布局内开放 fyt 文本助手：角色模板、分组模型选择、多轮流式聊天和按用户保存的本机历史。

**Architecture:** 复用现有内存 session，通过同源 Go `/pg/chat/completions` 请求模型。工作台新增小型适配组件，不解锁原 MuAPI 智能体 API，不改三个子模块，不新增 Go 接口、数据库表或 Python 服务。原图片/视频预览保持。

**Tech Stack:** 当前 Next 15 / React 19、原有 Tailwind、原有依赖、Node 内置测试；不改依赖版本。

## Global Constraints

- 仅改工作台仓库；fyt 主仓的其他任务 dirty 不动。
- 本文件为任务清单；实施状态以文末更新为准。
- 保留原版布局；新增组件复用现有视觉，不能改成另一套控制台。
- JWT 只存在内存；不写 localStorage、可读 Cookie、日志、URL或模板导出。
- 不访问原 MuAPI 业务接口、不创建平台 API Key，不执行收费请求自动重试。
- 无数据库、生产或供应商配置变更。真实收费联调须已有明确预算授权；无授权时交付 mock 验证和真实调用待验收记录。
- 本机预发更新沿用已有范围，只替换 studio 容器，不能替换原 Go/数据库服务。

## 0. 已核实接口与待核实运行事实

| 用途 | 当前源码接口 | 关键限制 |
|---|---|---|
| 用户组 | GET `/api/user/self/groups` | 仅使用服务端允许的分组，不硬编码 default/vip |
| 分组模型 | GET `/api/user/models?group=<encoded group>` | 不带 group 是多分组合集；错误地址 `/api/user/self/models` 不再使用 |
| 聊天能力 | GET `/api/pricing` | 使用 supported_endpoint_types 与 supported_endpoint 的路径映射筛选聊天；不能按名字猜能力 |
| 发起聊天 | POST `/pg/chat/completions` | body含model/group/messages/stream；原Go用户认证、分发和结算 |
| 身份/余额 | 现有 getAccessToken / getAccount | 沿用session revision，不能让A响应进入B页面 |

执行前只读核实当前预发响应结构与权限；源码不等于已部署版本。`/api/pricing` 如未识别用户身份，只作为端点能力辅助，不把其中匿名价格当作用户实扣。端点声明只证明协议分类，不证明 tools、多模态或供应商实际响应成功。

## 1. 文件边界与接口契约

以下路径相对 `/Users/smith/develop/project/Open-Generative-AI`。

| 文件 | 职责 |
|---|---|
| 新增 `lib/fyt/chat.mjs` | 固定同源接口访问、分组模型筛选、聊天请求构造和流读取 |
| 新增 `lib/fyt/chat-history.mjs` | 历史数据校验、完整轮次选择、按user.id读写；不包含网络/React |
| 新增 `lib/fyt/agent-templates.mjs` | 通用助手、提示词优化、分镜脚本、营销文案的中英文模板 |
| 新增 `components/fyt/FytAgentStudio.jsx` | 模板卡片、聊天、停止、手动重新生成、本机历史与自定义角色 |
| 修改 `components/StandaloneShell.js` | fyt模式的agents入口挂载新组件，其他原版模式不变 |
| 修改 `components/fyt/FytShell.jsx` | 传递会话状态及余额刷新回调，凭证不传原apiKey属性 |
| 修改 `next.config.mjs` | 仅本地开发rewrite补固定GET接口和/pg/chat/completions，不开放任意代理 |
| 新增 `tests/fyt-chat.test.mjs` | 流分片、错误、缺失终态、请求次数、会话切换 |
| 新增 `tests/fyt-chat-history.test.mjs` | 账号隔离、内容校验、体积限制、未完成轮次 |
| 修改 `docs/fyt-development.md`、`deploy/fyt-staging/README.md` | 入口、限制、验收和独立studio回退 |

函数契约：

```js
// chat.mjs
// 返回仅当前允许组；模型列表必须按选中组单独请求。
getChatGroups({ signal }) // Promise<Array<{ name: string, desc: string }>>
getChatModels({ group, signal }) // Promise<string[]>
streamChat({ model, group, system, messages, signal, onDelta })
// Promise<{ requestId: string | null, completed: boolean }>
// onDelta({ content: string, reasoning: string })
// messages只接受role=user/assistant、content字符串的完整上下文。

// chat-history.mjs
readChatHistory(storage, userId) // Conversation[]
saveChatHistory(storage, userId, conversations) // void；写满等错误由UI显示
selectChatContext(messages) // 完整的user/assistant轮次；不含最新待回答user
```

数据格式：`Conversation={id,title,model,group,templateId,system,messages,updatedAt}`；`Message={id,role,content,status}`，status为complete/streaming/stopped/error/interrupted。reasoning仅本轮页面显示，不持久化，不送回模型。会话ID用crypto.randomUUID；不作为服务端请求幂等键。

## Task 1：分组模型与固定请求边界

- [ ] 只读核实预发 `/api/status` 与上述GET返回结构；不读取整份凭证笔记，不输出token。
- [ ] 获取允许分组，优先恢复仍合法的历史group，否则选择当前账号组或首个允许组；空列表显示无可用分组并禁用发送。
- [ ] 查询该分组模型，与pricing中的chat/completions端点声明取交集。声明缺失/无法识别时显示能力待确认，不自动展示全部模型。
- [ ] 切换组取消旧GET；清空旧模型选择，再从新组恢复合法model。历史模型失效时保留文字记录但必须重新选模型。
- [ ] GET允许用户手动重试；POST仅在发送前调用getAccessToken刷新，收到401后停止本轮，不自动重新提交。
- [ ] 增加测试：分组切换后迟到响应被丢弃；非聊天模型排除；未登录零POST；接口404/403/429有明确状态且不触发收费请求。

验证命令：`node --test tests/fyt-chat.test.mjs`。预期新增上述测试通过；mock使用原生fetch/Response，不引入测试依赖。

## Task 2：聊天流与状态完整性

- [ ] 固定POST路径`/pg/chat/completions`、same-origin、Bearer内存凭证、stream=true。首版输出上限max_tokens=2048，不传未验证的temperature/tools/图片字段。
- [ ] 采用TextDecoder流模式保留跨chunk汉字；SSE支持LF/CRLF、跨chunk事件和`data: [DONE]`。只将content当回答，reasoning单独折叠展示。
- [ ] `finish_reason`终态或[DONE]才标complete；EOF无终态标interrupted，保留部分文字，提示未完整结束；解析到error立即终止。
- [ ] 未识别的usage/心跳事件跳过；非法JSON数据事件报告协议错误。非SSE成功响应只接受可识别的OpenAI非流式message.content结构，否则报告响应不兼容，不显示成功。
- [ ] 每次调用捕获user.id、session revision和页面runId；身份变化、组件卸载立即abort，并忽略旧delta、catch和finally。
- [ ] 禁止连续提交；按钮明确区分发送/停止。停止仅取消本地等待，不承诺上游已取消或退款；手动重新生成会再次收费，点击前明确说明。
- [ ] 保存完整回答；stopped/error/interrupted不自动作为下一轮上下文。待回答用户消息不能与新问题拼成孤立历史。
- [ ] 关键测试使用真实ReadableStream构造中文分字节片段、CRLF、DONE/error/EOF、A切B、abort和一次POST断言。

测试样本：

```js
test('transport failure never resubmits a chargeable request', async () => {
  let posts = 0;
  const original = globalThis.fetch;
  acceptAuthBundle(bundle(1), { broadcast: false });
  globalThis.fetch = async (_url, init) => {
    if (init.method === 'POST') posts++;
    throw new TypeError('network disconnected');
  };
  try {
    await assert.rejects(streamChat({ model: 'fixture-chat', group: 'fixture-group',
      system: '', messages: [{ role: 'user', content: 'hello' }],
      signal: new AbortController().signal, onDelta() {} }));
    assert.equal(posts, 1);
  } finally { globalThis.fetch = original; clearSession(); }
});
// fixture bundle沿用tests/fyt-session.test.mjs的结构；fixture模型不请求真实渠道。
```

## Task 3：模板、上下文与按账号本机历史

- [ ] 提供四种角色：通用助手；优化提示词但不声称生成图片；输出镜号/画面/时长/镜头运动的分镜助手；输出标题/卖点/行动号召的文案助手。中英文system分别静态配置。
- [ ] 用户可编辑角色名称和system，保存在会话内；换模板开启新对话，不悄悄修改已有对话角色。
- [ ] 保存键固定`fyt:studio:agents:v1:<正整数user.id>`，不读MuAPI旧历史、不按token做key；匿名仅浏览模板，不发送或保存。
- [ ] 上限：20个会话，每会话20个完整轮次，单用户输入6000字符、system4000字符；请求上下文最多24000字符。超限从最旧完整轮次裁剪并提示；这些是字符限制，不冒充精确Token额度。
- [ ] 本地JSON UTF-8总量上限1MiB；先剔除旧会话及旧完整轮次，仍超限则显示无法保存，不静默截断单条回答冒充完整内容。
- [ ] 只持久化明确字段；读入时校验数组、角色、字符串长度、状态与版本，不将任意对象直接spread进请求。刷新读到streaming转为interrupted，不能自动重发。
- [ ] 切换账号清空视图；流式会话切换先停止，发送中禁止切换组/model/system。隐藏agents页时保留挂载，与已有图片/视频行为一致。
- [ ] localStorage禁用/写满时仍可聊天，但页面明确显示本轮未保存；渲染Markdown禁用原始HTML，不把输出当脚本或工具执行。

测试样本：

```js
test('user histories stay separate', () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value) };
  const conversation = { id: 'a', title: 'A', model: 'fixture-chat', group: 'fixture-group',
    templateId: 'general', system: '', updatedAt: 1,
    messages: [{ id: 'u', role: 'user', content: 'A', status: 'complete' },
      { id: 'r', role: 'assistant', content: 'answer', status: 'complete' }] };
  saveChatHistory(storage, 1, [conversation]);
  assert.equal(readChatHistory(storage, 1)[0].title, 'A');
  assert.deepEqual(readChatHistory(storage, 2), []);
  assert.throws(() => saveChatHistory(storage, '../1', []), /INVALID_USER/);
});
```

## Task 4：原版界面挂载与余额刷新

- [ ] 使用FytAgentStudio替换agents占位页，保留侧栏、header、账号控件和原版卡片/气泡视觉。不将JWT传给原AgentStudio。
- [ ] 匿名卡片可看，聊天输入提示登录；登录按钮继续走现有redirect校验。发送前展示“调用消耗fyt额度”。
- [ ] 完成、失败、停止后回调刷新余额，仍按session revision处理迟到结果；刷新失败只显示余额读取失败，不重发模型请求。
- [ ] 不用余额差显示单次费用，不将usage或pricing.display.final拼成“实际扣费”。首版引导去原控制台消费日志查询，费用关联未确认时不显示伪精确金额。
- [ ] 顶部文案改为按能力说明：文本助手已接入、媒体仍预览；未接入菜单使用模块具体说明。
- [ ] 本地rewrite仅补固定组/模型/pricing与聊天路径；不修改middleware让原MuAPI API整体恢复。

## Task 5：预发体验、验收与回退

- [ ] 实施前记录当前studio image ID并保留可恢复标签；只构建并更新studio，不改原Go/DB/Nginx。镜像使用新标签，不能覆盖唯一旧产物。
- [ ] 必要纯逻辑测试通过后构建Linux镜像；先交付预发`/create/zh/studio/agents`供用户体验，不先跑冗长全套验收。
- [ ] 体验项目：模板切换、角色编辑、多轮、停止、刷新恢复、A/B隔离、窄屏输入、切换图片/视频不丢草稿。无真实请求授权时以开发mock证明流处理，不能把mock挂成预发可用真实渠道。
- [ ] 用户体验满意后完成`node --test tests/fyt-*.test.mjs`及必要构建/审查。真实单轮验证需确认预算和模型，不自动探测所有模型。
- [ ] 如果预发发现回归，只把studio切回记录的旧镜像重建；不覆盖旧conf或回滚fyt数据库。
- [ ] 更新两项目日志、共享状态、验收记录，分列代码完成、mock通过、用户体验、真实收费验证四种证据。

## 首版完成定义

模板/自定义角色/实际分组模型选择/多轮流式/停止/本机历史/账号隔离/余额刷新均可使用；原版UI保持，原MuAPI路径仍关闭。未经预算授权的真实收费验证独立列待办，不能宣称端到端费用验收完成。跨设备保存、工具执行、联网、附件、多代理、工作流、媒体与成本统计改造均不包含在首版。


## 实施状态（2026-10-23）

- 已实现Task1–4的工作台代码、mock检查与构建：固定同源请求、分组/端点过滤、角色模板、SSE、本机历史、原版页面挂载及余额刷新。
- 独立审查发现的同账号新会话旧Bearer竞态、历史模型静默替换已修复；超长内容不得静默清空历史。新增回归检查。
- 预发独立studio镜像使用新标签，保留旧镜像可回退；没有新增依赖、Go改动、迁库或收费请求。
- 运行时GET定价目录已核实；认证分组/模型及页面交互仍待用户体验，真实生成/结算尚未验收。浏览器工具因已保存权限拒绝18443，未尝试绕过。

Task5预发更新已完成：镜像fyt-studio:staging-text-20261023-v1，容器healthy，页面/API边界状态检查通过。定向测试40/40；用户页面体验和真实文本调用仍待确认，不能标记完整渠道/账务验收完成。
