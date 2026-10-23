# FYT 单张图片生成接入计划

**目标**：沿用原ImageStudio布局接入现有default/gpt-image-2，单张文生图、登录态、现有计费、结果显示和余额刷新。无自动重发，不开放编辑/批量/未知参数。

## 当前证据

- 本机18443 #27类型60已启用，default，gpt-image-2，无模型映射和参数覆盖。#1仍停用。
- /api/pricing返回billing_mode=tiered_expr，表达式tier("standard", p * 5 + cr * 1.25 + c * 30)，不是单张固定价。ModelRatio2.5/CompletionRatio6不能单独概括最终计费；预发无request_costs/upstream_cost_prices，不能宣称完成采购成本/利润核对。
- 模型能力metadata未列images端点，仅列文本端点；不得将元数据作为生图成功证据。本轮显式限定gpt-image-2并验证实际Images兼容性。
- 现有/pg仅chat，/v1/images/generations要API Key，不能把登录JWT直接当Key。前端不得保存或索要供应商Key。
- fyt主仓dirty有其他任务，未经确认不把其改动一起构建。已询问是否用独立checkout实现并更新本机API；生产不动。

## 任务与验证

- [ ] 独立checkout确认基线与预发当前镜像兼容，保留原镜像；若存在潜在DB升级/覆盖风险停止部署并说明。
- [ ] /pg/images/generations走UserAuth和专用控制器；复用Playground上下文但RelayFormatOpenAIImage，Path2RelayMode识别/pg/images/generations；Distribute按受限group校验并选择渠道。保持IsPlayground语义，不创建永久API Key。禁止shared token:0并发槽，按user_id限制。
- [ ] 专用入口约束model=gpt-image-2、非空有界prompt、n=1、非流式；首轮不传size/quality等未经供应商验证的参数。所有验证必须在收费前完成。
- [ ] 工作台lib/fyt/images.mjs复用现有会话隔离，获取用户组/可用模型，与显式已验证支持集相交。POST一次、不自动重试，归一data[]的b64_json/https URL；优先base64避免宽泛CSP或服务端任意URL抓取。错误显示安全摘要及请求ID；取消不承诺退款。
- [ ] 原ImageStudio通过可选fyt adapter接入，原MuAPI模式不变；登录前禁生成，单张/无上传，保留原画廊和PromptComposer。结果仅内存（base64不写localStorage），明确刷新需下载；余额完成后刷新。
- [ ] Node会话切换/401/错误/无自动重试/非法结果测试；Go定向路由/参数/分组及模拟图片回归，避免真实媒体重复收费。
- [ ] 用户批准本机API更新后部署，真实单张请求一次，核对RequestId、日志结算额度与结果图像；不要用余额差代替并发下单次扣费。失败停止，不自行循环收费。上游账单需额外证据，不能把fyt扣费当成本。
- [ ] 新studio镜像和旧镜像均保留，仅本机预发，health/匿名401/页面200；日志/文档更新，真实页面效果用户体验。

## 暂不做

图生图/编辑/参考图上传、视频音频、批量、多模型参数、云素材库、AI画布工具调用、采购成本体系、生产部署和提交推送。单张链路验证通过后再继续生成结果导入本地画布/编辑器等相关任务。

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
