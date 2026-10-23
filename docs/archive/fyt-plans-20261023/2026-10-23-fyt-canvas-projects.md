# 本地可编辑画布项目文件实施计划

**目标：** 无限画布保存/打开自包含`.fytcanvas` v1项目，恢复图片、文字、几何、层级、锁定/隐藏与视口，增加未保存提示。按writing-plans/executing-plans推进本地交付，不改DB或云存储。

## 格式与边界

根字段仅format/version/assets/nodes/viewport；format=fyt-canvas，version=1。素材仅PNG/JPEG/WebP base64（校验头部、单个10MiB，总50MiB、20素材）；节点最多100，引用已有素材、唯一ID、有限数值/合理位置尺寸、纯文本6000字符、有限颜色/布尔状态；不保存JWT、用户、image对象、blobURL、远端URL、未知字段。文件最多72MiB，解码后仍检查单图16MP/单边8192、总32MP。

- 新增子模块`packages/Open-AI-Design-Agent/packages/design-agent/src/localCanvasProject.js`：纯格式校验、属性白名单、序列化/解析、base64转换；不访问网络。
- 新增`tests/fyt-canvas-project.test.mjs`：项目往返、共享素材、多行文字/变换/层级、坏版本/重复ID/悬空引用/外链/非栅格/超限/未知字段、恢复阶段中途失败资源释放及原图保留的可测逻辑。
- CanvasArea localOnly API：读取可保存节点和视口快照；一次性替换已校验布局/已解码素材，所有潜在失败在setState前检查；清理旧选择/剪贴板/pending，原模式不变。
- 脏状态由节点数组引用和已保存基线比较，视口平移缩放本身不标记内容未保存；保存过程中有新修改不清脏状态。打开成功建立干净基线。
- 修改FytCanvasStudio：保留原File用于保存、保存项目/打开项目、准备所有素材成功后才替换；放弃替换/解码失败不清旧画布；clear/卸载/账号切换取消异步操作并释放临时URL。
- 刷新/整页离开使用beforeunload，当前工作台退出通过可取消事件检查未保存；跨标签已发生的退出仍优先清除身份与素材，不承诺能拦截。
- 开项目与保存期间禁重复文件操作；保留PNG导出用途，导出PNG不标记项目已保存；下载仅视为“项目文件已生成”，浏览器最终落盘无法由页面证明。
- 独立审查后仅更新studio新镜像`fyt-studio:staging-project-files-20261023-v1`，保留画布版可回退。父/子仓均不提交或推送。

## 验证与交付

Node关键边界/失败释放检查；既有fyt回归；父/子diff --check；Linux四包+Next构建；预发health/接口状态。真实保存/重开文件、像素和浏览器原生离开确认仍需用户体验，不重试或绕过浏览器权限。

本轮不做云端项目列表、服务端素材、账户间项目共享、数据库迁移、工作流或媒体渠道。云保存先独立设计再实施。

## 本轮交付记录

- 已实现codec、CanvasArea快照/原子恢复/保存基线、wrapper原图保存/打开/释放、未保存状态及退出事件；原MuAPI模式默认行为保留。
- 独立审查发现翻转偏移遗漏，已补offsetX/offsetY校验/保存/恢复，真实Konva几何往返用例覆盖并经审查复核关闭。
- `node --test tests/fyt-*.test.mjs`：60通过、0失败（其中项目文件9项）；父子仓diff --check通过；四子包与Next Linux镜像构建成功。已有module type/Browserslist提示，未修改依赖。
- 本机studio已更新`fyt-studio:staging-project-files-20261023-v1`，image sha256:b6456ab4e4463467436b5f87034df8bc896385ee3eae1b942743aa146ed96ece；旧画布镜像保留。页面与/api/status HTTP200；原API镜像仍7919a16f8a88…，无DB/生产变更。
- 未调用浏览器，未做收费请求。真实下载/打开、取消替换/原生离开确认、图片像素需用户体验。父/子仓均未提交/推送，子模块源码后续需单独纳入提交。
