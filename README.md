# 投研日报站点

这个仓库把本地按日期保存的 `盘前分析.md`、`盘中分析.md`、`盘后复盘.md` 构建成静态网站，并通过 GitHub Pages 对外访问。

## 交易系统文件

- `rules.md`：长期交易规则库，只保存可跨日期复用的判断、执行和风控规则。
- `watchlist.md`：观察池，按方向维护核心标的和验证规则。
- `memory.md`：长期经验沉淀，不保存当天行情快照或短期方向。
- `plans/YYYY-MM-DD_交易计划.md`：早盘生成的结构化交易计划。
- `trades/YYYY-MM-DD_交易日志.md`：盘后生成或更新的交易执行与纪律复盘。
- `templates/`：交易计划和交易日志模板。

## 本地构建

```bash
npm run build
```

构建产物会生成到 `dist/`。

## 发布

```bash
./scripts/publish-site.sh
```

脚本会构建站点、提交新增报告，并推送到 GitHub。GitHub Actions 会自动部署 Pages。

## 微信桥接后台服务

微信桥接工具位于 `tools/weixin-bridge/`，不依赖 OpenClaw 常驻进程。运行状态、日志、收件箱和临时文件统一保存在 `tools/weixin-bridge/state/`，该目录不会提交到 Git。

首次拉取后，请先为子项目单独安装依赖：

```bash
npm --prefix tools/weixin-bridge install
```

```bash
npm run weixin:login
npm run weixin:service:install
npm run weixin:service:status
npm run weixin:service:stop
npm run weixin:service:restart
npm run weixin:service:uninstall
```

如果你希望直接从仓库脚本启动服务，可以使用：

```bash
./scripts/start-weixin-service.sh
```

根仓库里的 `weixin:*` 命令会转发到 `tools/weixin-bridge/` 子项目。默认服务以本地命令模式运行。需要把微信消息转给 Codex 时，使用：

```bash
npm run weixin:service:uninstall
npm run weixin:service:install -- --codex
```
