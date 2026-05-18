---
name: weixin-bridge
description: 使用已部署的微信桥接服务发送消息、查看状态和管理登录。Invoke when user asks to send WeChat messages, check bridge status, or operate the remote Weixin bridge.
origin: repo
version: 1.0
---

# 微信桥接服务

## Scope

这个 skill 只描述如何使用远端微信桥接服务，不保存任何真实 token。

服务地址：

- 管理台：`https://weixin-bridge.starfire.site/admin/ui`
- API Base URL：`https://weixin-bridge.starfire.site`

## Secret Policy

- 不要把 API token、Admin token 或任何登录态写入仓库文件。
- 不要把 token 写进 `SKILL.md`、README、脚本示例或提交信息。
- 调用 API 时从环境变量读取 token：
  - `WEIXIN_BRIDGE_API_TOKEN`
  - `WEIXIN_BRIDGE_ADMIN_TOKEN`
- 如果环境变量不存在，先询问用户或提示用户在本地 shell 中临时导出。
- 示例命令必须使用环境变量占位，不能硬编码真实 token。

本地临时设置示例：

```bash
export WEIXIN_BRIDGE_API_TOKEN="<set-locally>"
export WEIXIN_BRIDGE_ADMIN_TOKEN="<set-locally>"
```

## Runtime

服务已部署在远端，不需要本地启动 Docker 或 Node 服务。

默认只通过 HTTPS 访问：

```bash
WEIXIN_BRIDGE_BASE_URL="https://weixin-bridge.starfire.site"
```

## API Auth

业务接口使用 API token：

```bash
Authorization: Bearer ${WEIXIN_BRIDGE_API_TOKEN}
```

管理接口使用 Admin token：

```bash
Authorization: Bearer ${WEIXIN_BRIDGE_ADMIN_TOKEN}
```

## Status

查看服务状态：

```bash
curl -s "${WEIXIN_BRIDGE_BASE_URL:-https://weixin-bridge.starfire.site}/status" \
  -H "Authorization: Bearer ${WEIXIN_BRIDGE_API_TOKEN}"
```

查看账号列表：

```bash
curl -s "${WEIXIN_BRIDGE_BASE_URL:-https://weixin-bridge.starfire.site}/accounts" \
  -H "Authorization: Bearer ${WEIXIN_BRIDGE_API_TOKEN}"
```

## Send Message

发送普通文本：

```bash
curl -s -X POST "${WEIXIN_BRIDGE_BASE_URL:-https://weixin-bridge.starfire.site}/send" \
  -H "Authorization: Bearer ${WEIXIN_BRIDGE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "account": "research-bot",
    "message": "你好，这是来自微信桥接服务的消息"
  }'
```

发送 Markdown：

```bash
curl -s -X POST "${WEIXIN_BRIDGE_BASE_URL:-https://weixin-bridge.starfire.site}/send/markdown" \
  -H "Authorization: Bearer ${WEIXIN_BRIDGE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "account": "research-bot",
    "message": "# 标题\n\n这是一条 Markdown 消息"
  }'
```

发送媒体文件：

```bash
curl -s -X POST "${WEIXIN_BRIDGE_BASE_URL:-https://weixin-bridge.starfire.site}/send/media" \
  -H "Authorization: Bearer ${WEIXIN_BRIDGE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "account": "research-bot",
    "filePath": "/absolute/path/to/file.txt"
  }'
```

## Message Policy

- 微信文本长度限制为 3500 字符。
- 超过 3500 字符时，应优先使用服务端 `filePath` 自动降级为媒体发送。
- `.md` 文件作为附件发送时，服务端会转换为 `.txt` 后上传，避免微信端无法打开。
- 如果用户要求发送敏感内容，先确认目标和内容，不要自动广播。

## Operational Rules

- 优先使用 `alias` 指定账号，例如 `research-bot`。
- 发送前如果不确定账号状态，先调用 `/accounts` 或 `/status`。
- 业务发送只使用 `/send*` 接口，并使用 `WEIXIN_BRIDGE_API_TOKEN`。
- API 返回 `ok: false` 或 HTTP 非 2xx 时，必须把错误信息反馈给用户。
- 不要在回复中暴露完整 token；如需引用，只能写成脱敏形式。

## Quick Checklist

使用本 skill 时：

- 确认 `WEIXIN_BRIDGE_API_TOKEN` 是否已在本地 shell 设置。
- 如需登录管理，确认 `WEIXIN_BRIDGE_ADMIN_TOKEN` 是否已设置。
- 优先访问 `https://weixin-bridge.starfire.site`。
- 不创建包含真实 token 的文件。
- 不提交、打印或记录真实 token。
