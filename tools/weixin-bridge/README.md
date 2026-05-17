# 微信桥接工具

这个目录是一个独立的 TypeScript 子项目，负责投研项目里的微信 AI 桥接能力。

## 目录说明

- `src/`：TypeScript 源码。
- `dist/`：编译产物，由 `npm run build` 生成，最终收敛为单文件 `dist/index.js`。
- `stubs/openclaw/`：桥接工具内置的 `openclaw` 兼容依赖，不再依赖仓库外部 stub。
- `state/`：本地运行状态、日志、收件箱、临时文件，不提交到 Git。

## 安装依赖

```bash
cd tools/weixin-bridge
npm install
```

## 常用命令

```bash
cd tools/weixin-bridge
npm run login
npm run status
npm run listen
npm run server
npm run service:install
npm run service:status
```

说明：

- `npm run login`：扫码登录，保存独立运行所需的微信账号状态。
- `npm run listen`：启动本地轮询，接收消息并写入 `state/inbox/`。
- `npm run server`：启动 HTTP 服务；消息发送统一走 HTTP API，不再提供命令行发送入口。
- `npm run service:install` / `npm run service:status`：管理 macOS `launchd` 后台服务。

## 构建

```bash
cd tools/weixin-bridge
npm run build
```

构建结果：

- 单文件入口：`dist/index.js`
- 常用直调形式：`node dist/index.js login`、`node dist/index.js server`、`node dist/index.js service status`

## 从根仓库调用

根仓库已经保留了转发命令，例如：

```bash
npm run weixin:status
./scripts/start-weixin-service.sh
```

## HTTP 服务

启动：

```bash
cd tools/weixin-bridge
npm run server
```

默认监听地址：

- `http://127.0.0.1:8787`

常用接口：

- `GET /health`
- `GET /admin/ui`
- `GET /status`
- `GET /accounts`
- `GET /contacts`
- `GET /inbox?limit=50&since=ISO`
- `GET /admin/login/sessions`
- `GET /admin/login/session/:id`
- `GET /admin/login/alias/:alias`
- `POST /admin/login/start`
- `POST /send`
- `POST /send/markdown`
- `POST /send/batch`
- `POST /send/media`

## 发送模式

### 主动发送

主动发送是默认模式。

- 默认 `reply = false`
- 不读取、不使用本地缓存的 `context_token`
- 适合你当前 bridge 的常规业务场景

请求体示例：

```json
{
  "message": "你好，这是主动发送"
}
```

返回特征：

- `reply: false`
- `hasContextToken: false`
- `usedContextToken: false`

### 回复发送

回复发送需要显式指定 `reply = true`。

- 只在明确需要“沿用最近会话上下文”时使用
- 会读取当前目标用户最近一次入站消息对应的 `context_token`
- 如果本地没有可用上下文，`hasContextToken` 会是 `false`

请求体示例：

```json
{
  "message": "你好，这是回复发送",
  "reply": true
}
```

返回特征：

- `reply: true`
- `hasContextToken: true`
- `usedContextToken: true`

## Docker 部署

现在支持把 bridge 作为 Docker 服务部署到远程服务器。

容器特性：

- 服务入口仍然是 `node dist/index.js server`
- 运行态统一持久化到容器内 `/data/state`
- 默认同时提供业务接口和 `/admin/*` 登录管理接口
- 容器首次启动时即使还没有登录账号，也不会退出；完成扫码登录后会自动开始轮询

### 构建镜像

```bash
docker build -t investment-research-weixin-bridge ./tools/weixin-bridge
```

### 使用 Compose

根目录已提供 `docker-compose.weixin-bridge.yml`：

```bash
export WEIXIN_API_TOKEN="replace-with-strong-token"
export WEIXIN_ADMIN_TOKEN="replace-with-admin-token"
docker compose -f docker-compose.weixin-bridge.yml up -d --build
```

说明：

- 如果不设置 `WEIXIN_ADMIN_TOKEN`，服务端会自动回退使用 `WEIXIN_API_TOKEN`
- 运行态默认使用 named volume `investment-research-weixin-bridge-state`
- 默认暴露 `8787` 端口，可通过 `WEIXIN_BRIDGE_PORT` 覆盖宿主机端口
- Compose 默认接入外部 Docker 网络 `openwrt-clash-config_clash_bridge`，可通过 `WEIXIN_DOCKER_NETWORK` 覆盖

### 服务端扫码登录

容器启动后，通过管理接口发起登录：

```bash
curl -X POST http://127.0.0.1:8787/admin/login/start \
  -H "Authorization: Bearer ${WEIXIN_ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "alias": "research-bot",
    "default": true
  }'
```

返回示例：

```json
{
  "ok": true,
  "session": {
    "sessionId": "uuid",
    "alias": "research-bot",
    "status": "pending",
    "qrcodeUrl": "https://...",
    "startedAt": "2026-05-16T00:00:00.000Z",
    "expiresAt": "2026-05-16T00:05:00.000Z"
  },
  "qrcodeUrl": "https://..."
}
```

扫码后轮询状态：

```bash
curl http://127.0.0.1:8787/admin/login/session/<sessionId> \
  -H "Authorization: Bearer ${WEIXIN_ADMIN_TOKEN}"
```

可用状态：

- `pending`：等待扫码
- `succeeded`：登录成功，账号已写入 `state/accounts/`
- `expired`：二维码超时或服务重启
- `failed`：登录失败

查看最近登录会话：

```bash
curl http://127.0.0.1:8787/admin/login/sessions \
  -H "Authorization: Bearer ${WEIXIN_ADMIN_TOKEN}"
```

按 alias 查询最近一次登录状态：

```bash
curl http://127.0.0.1:8787/admin/login/alias/research-bot \
  -H "Authorization: Bearer ${WEIXIN_ADMIN_TOKEN}"
```

## 内置管理台

服务内置了一个轻量管理台：

```bash
open http://127.0.0.1:8787/admin/ui
```

当前首版能力：

- 登录管理：发起扫码登录、按 alias 轮询最近一次登录状态
- 状态总览：查看运行态与账号列表
- 消息发送：支持文本、Markdown 和媒体发送

说明：

- 页面本身可以直接打开，但真正的数据访问仍需要手动填写 `Admin Token` / `API Token`
- Token 仅保存在浏览器 `localStorage`

## HTTP 示例

### 主动发送文本

```bash
curl -X POST http://127.0.0.1:8787/send \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "你好，这是主动发送"
  }'
```

说明：

- 如果只传 `filePath`，服务会先读取文件内容
- 文件内容长度不超过 3500 时，按普通文本发送
- 文件内容长度超过 3500 时，自动改走媒体发送

### 回复发送文本

```bash
curl -X POST http://127.0.0.1:8787/send \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "你好，这是回复发送",
    "reply": true
  }'
```

### 主动发送 Markdown

```bash
curl -X POST http://127.0.0.1:8787/send/markdown \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "# 标题\n\n这是主动发送的 Markdown"
  }'
```

说明：

- 如果只传 `filePath`，服务会先读取文件内容，再按 Markdown 文本规则处理
- 处理后的文本长度超过 3500 时，自动改走媒体发送
- 如果作为附件发送的源文件是 `.md`，会自动改名为 `.txt`

### 主动发送媒体

```bash
curl -X POST http://127.0.0.1:8787/send/media \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "这是一张图片",
    "filePath": "/absolute/path/to/file.png"
  }'
```

说明：

- 微信客户端无法正常打开 `.md` 附件
- 发送媒体时如果源文件后缀为 `.md`，bridge 会自动以 `.txt` 文件名上传

### 指定账号发送

```bash
curl -X POST http://127.0.0.1:8787/send \
  -H 'Content-Type: application/json' \
  -d '{
    "account": "your-account-id",
    "to": "target-user-id@im.wechat",
    "message": "指定账号主动发送"
  }'
```

## 返回字段说明

发送接口返回里，和发送模式最相关的字段有：

- `reply`：本次请求是否按回复语义发送。
- `hasContextToken`：本地是否拿到了目标用户的上下文令牌。
- `usedContextToken`：这次发送是否真的带上了上下文令牌。
- `ackMode`：当前微信接口返回确认模式；`http-only` 表示接口返回 `HTTP 200 {}`，但没有额外业务回执体。
