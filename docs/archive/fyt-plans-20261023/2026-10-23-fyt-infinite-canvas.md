# fyt 本地无限画布实施计划

**目标：** 复用原设计智能体的CanvasArea/Konva画布，在fyt模式开放本地图片、文字、拖拽/缩放/旋转、排列和透明PNG全内容导出。

**架构：** 新FytCanvasStudio直接加载design-agent的CanvasArea；不加载CreativeCanvas/DesignAgentStudio，不访问其会话、技能、任务服务。本轮明确修改Open-AI-Design-Agent子模块的CanvasArea以增加默认关闭的localOnly属性，原MuAPI模式保持。使用writing-plans/executing-plans按任务实施。

## 范围与文件

- 新增`components/fyt/FytCanvasStudio.jsx`与局部CSS：沿用原画布与浮动工具栏，提供图片/文字工具、缩放、适应内容和导出；按现有父级身份key清空，菜单切换保留，刷新不保留。
- 修改子模块`packages/Open-AI-Design-Agent/packages/design-agent/src/CanvasArea.jsx`：新增localOnly/active/onLocalFiles/isLocalSource属性，本地路径与原路径分支；只允许已校验blob图片，关闭视频/音频/任务注入；隐藏时不监听粘贴和快捷键；对本地文本、元素数量、异步加载代次作校验。
- 新增该子模块`src/localCanvas.js`和工作台`tests/fyt-canvas.test.mjs`：全内容导出几何范围/空画布/超界限与纯文本限制。
- 修改`StandaloneShell.js`与`FytAppsStudio.jsx`：design-agent入口挂载本地画布，目录增加实际入口，不显示为AI设计助手。
- 使用已有`packages/studio/src/localImage.js`校验本地文件；不新增依赖，不改package/go版本，不存token或图片到localStorage，不迁数据库、不收费、不重试浏览器权限。

## 交付任务

- [ ] 1. 读取原画布所有粘贴/拖放/导出/任务及键盘路径；子模块原dirty确认干净，保护主仓既有改动。
- [ ] 2. 新增纯逻辑边界检查，先看到缺失模块失败，再实现；透明PNG包含全部可见图片和文字（含旋转/负坐标），不含网格/选择框。单边8192/1600万像素，过大明确报错，不静默裁切。
- [ ] 3. CanvasArea localOnly模式只接受wrapper登记过的blob URL，所有导入入口同一校验；文字6000字符，最多100个元素，图片源累计最多20张/32MP/50MiB；清空后释放素材并重置预算。
- [ ] 4. 复用图片加载器并在导入/清空/卸载竞态中释放URL；复制/删除/锁定/隐藏等保留原交互；本地粘贴内部元素不读取系统剪贴板权限，原生粘贴走校验回调。
- [ ] 5. 包装原CanvasArea与原浮动缩放工具；明确“本地无限画布，AI未接入、刷新或切账号清空”；全图PNG导出与适应全部内容可点。
- [ ] 6. 独立审查异步加载、账号隔离、隐藏页面快捷键与导出范围；修复重要问题后构建新studio镜像，保留本地编辑版可回退，只替换studio容器。

## 验证与边界

Node检查覆盖几何及本地文本/素材边界；Linux四子包+Next standalone构建；预发页面状态、健康和原API镜像保持。实际画布手势/像素导出仍由用户体验确认，不绕过被拒绝的浏览器工具。视频/音频、AI、云保存、项目同步、协作及撤销重做不属于本地画布首版；原画布没有通用撤销重做，本轮不虚假添加按钮。

## 回退与Git

新镜像`fyt-studio:staging-canvas-20261023-v1`；保留旧`fyt-studio:staging-local-editor-20261023-v1`，回退只切studio镜像，不覆盖Nginx或数据库。子模块与父仓均只保留未提交改动，不自行commit/push；后续正式提交需先处理子模块源码与引用，再提交父仓。

## 实施结果（2026-10-23）

本地画布与目录入口实现并上预发，镜像fyt-studio:staging-canvas-20261023-v1，IDa4711f428e05…，容器healthy。复用原CanvasArea，localOnly默认false。独立审查发现fit旧算法不含真实文字/旋转边界，现已与export共用实际可见节点getClientRect；复核关闭。

新增5项几何/文本检查，含真实Konva.Group/Rect的pan/zoom/旋转，全部fyt检查51/51通过。Linux四子包+Next standalone构建通过。中英文画布、apps/layers/agents/login/status HTTP200，匿名self401，原creative-agent会话代理404；原API image保持7919a16f…且healthy。没有运行真实浏览器或生成调用，像素和手势验收由用户体验；未提交父仓/子模块源码。
