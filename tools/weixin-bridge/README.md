# 微信桥接工具

这个目录是一个独立的 TypeScript 子项目，负责投研项目里的微信 AI 桥接能力。

## 目录说明

- `src/`：TypeScript 源码。
- `dist/`：编译产物，由 `npm run build` 生成。
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

## 构建

```bash
cd tools/weixin-bridge
npm run build
```

## 从根仓库调用

根仓库已经保留了转发命令，例如：

```bash
npm run weixin:status
./scripts/start-weixin-service.sh
```
