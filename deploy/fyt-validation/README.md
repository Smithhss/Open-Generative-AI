# 本地图片协议验证

这是 fyt 网关的离线验证环境，不是工作台已经接通的真实供应商环境。

- API：`http://127.0.0.1:13100`，只发布本机端口。
- Go 基线：`c06146b96`，从独立 checkout 编译；主 fyt 工作目录不变。
- 数据：全新 SQLite Docker volume，无生产数据库副本。
- 上游：`http://mock:8080`，仅返回一个固定测试像素，故意失败请求返回 400。
- API 和模拟上游只接 internal 网络，无外部路由；独立 Nginx 网关连接 internal/edge 两网，仅发布本机端口，不提供任意地址代理。
- 渠道类型 60、模型 `gpt-image-2-1k`、固定基础价格 0.05 USD/次，用于检查现有链路。
- `fixture-key-not-valid-anywhere` 是模拟服务固定测试字符串，不是供应商凭证。
- 随机会话密钥及本地管理员凭证仅保存在 Obsidian 项目凭证目录，不放进仓库。

## 启动

先将最新 Go 基线编译为 Linux arm64（Mac Apple Silicon）：

```bash
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -mod=readonly -o <临时构建目录>/foyton-api .
cp LICENSE NOTICE THIRD-PARTY-LICENSES.md <临时构建目录>/
```

运行镜像包含编译出的 `foyton-api`，基础镜像沿用 fyt 的 Debian bookworm-slim。
从本仓库根目录使用 `runtime.Dockerfile`，以只包含二进制的临时目录作 build context：

```bash
docker build -f deploy/fyt-validation/runtime.Dockerfile -t fyt-studio-validation:c06146b96 <临时构建目录>
```
然后以 Obsidian 中记录的私有环境文件启动：

```bash
docker compose --env-file <Obsidian 中的私有环境文件> -f deploy/fyt-validation/compose.yml up -d
```

不要把真实上游地址或 Key 配进此离线验证渠道。
需要真实生图时另设具备明确外部访问与预算的环境，不能声称这里的模拟图证明模型可用。

## 验证

```bash
python3 deploy/fyt-validation/check.py --env-file <Obsidian 中的私有环境文件>
```

脚本只访问固定 `127.0.0.1:13100`，初始化全新本地账号和模拟渠道。
验证成功返回测试像素、扣减 25000 quota，以及上游故意失败后净扣减为 0。
生成的本地 API Key 会追加保存到私有环境文件，不输出到终端。

## 本地网页登录闭环

登录联调在本隔离 Go 上复用 fyt 原前端；`login-compose.yml` 提供只读静态前端和同源网关，入口 `http://127.0.0.1:8080/create/zh/studio`。安装、构建、启动见 [开发说明](../../docs/fyt-development.md)。只使用项目 Obsidian 私有环境文件中的隔离账号，不使用生产账号或复制生产 Cookie。

## 停止隔离 Go

```bash
docker compose --env-file <Obsidian 中的私有环境文件> -f deploy/fyt-validation/compose.yml stop
```

保留数据卷；删除数据或容器前遵循用户授权规则。
