# fyt 工作台开发说明

> 计划与任务清单见 [fyt-workbench-plan-v2.md](./fyt-workbench-plan-v2.md)。本文只保留开发、部署与边界约定。

## 当前接入状态

| 入口 | 状态 | 说明 |
|---|---|---|
| 图片（文生图） | 已接入 | 模型来自 `/api/user/models?type=image`，不再写死模型名 |
| 图片（图生图） | 已接入 | 上传参考图走 `/pg/images/edits`，PNG/JPEG/WebP，≤20MB |
| 视频 | 已接入 | `/pg/videos` 异步任务，刷新后按任务编号续查 |
| 文本助手 | 已接入 | 模板、多轮、流式、本机历史 |
| 无限画布 / 本地图片编辑 | 本地可用 | 不上传、不扣费 |
| 其余 Studio | 隐藏 | 路由保留可直达，导航不展示 |

## 本地开发

```bash
# 仓库根目录
NEXT_PUBLIC_STUDIO_MODE=fyt NEXT_TELEMETRY_DISABLED=1 npm run dev -- --hostname 127.0.0.1 --port 3100
```

`NEXT_PUBLIC_STUDIO_MODE` 是构建期配置，切换后必须重启开发服务或重新构建，不能拿同一份产物临时切模式。

直接访问 3100 时，Next 会把 `/api`、`/pg` 等路径代理到 fyt API（`FYT_LOCAL_API=true` 时指向本机隔离环境）。完整联调建议直接使用现有预发入口，省去自建网关。

## 现有预发

- 入口：`http://127.0.0.1:18443/create/zh/studio`
- 构建：`docker build -f deploy/fyt-staging/Dockerfile -t fyt-studio:<tag> .`
- 部署：改 `deploy/fyt-staging/compose.yml` 的 `image` 后 `docker compose -f deploy/fyt-staging/compose.yml up -d studio`
- 工作台作为独立 Next 容器运行，不直连数据库；账号、余额、会话全部复用 fyt 预发

## 部署边界

- `/create` 交给 Next；`/api`、`/pg`、`/v1` 交给 Go；`/login`、`/_fyt` 交给现有 fyt 前端
- fyt 模式下 middleware 拒绝原版 `/create/api/*`（双 `/api`、上传、工作流、Agent 代理），避免旧页面拿 MuAPI Cookie 调供应商
- CSP 只允许同源连接；图片产物是上游 https 外链，`img-src` 单独放开 `https:`
- 不把 Next 放在生产 API 前面，不启用本地 rewrite

## 会话与数据

- JWT 只在内存；Go 签发 HttpOnly refresh Cookie。浏览器持久化只有登录标记、无 Token 的会话通知
- 余额只读 `/api/user/self` 与 `/api/status`；读取失败显示未知，不用余额差推算单笔费用
- 视频任务号按 `fyt.video.task.<userId>` 存 localStorage，仅用于刷新续查
- 图片结果只在页面内存，切换菜单保留，刷新/换账号清除；不写 localStorage

## 验证

```bash
node --test tests/fyt-*.test.mjs
NEXT_PUBLIC_STUDIO_MODE=fyt NEXT_TELEMETRY_DISABLED=1 npm run build
```

注意：WorkBuddy 的文件系统拦截会让 `next build` 在创建 `.next` 目录时失败，此时改用 `docker build -f deploy/fyt-staging/Dockerfile` 验证，构建在容器内完成，不受影响。
