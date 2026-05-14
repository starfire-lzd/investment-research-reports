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
- `GET /status`
- `GET /accounts`
- `GET /contacts`
- `GET /inbox?limit=50&since=ISO`
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
