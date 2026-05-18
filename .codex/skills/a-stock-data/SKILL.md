---
name: a-stock-data
description: A股本地数据工具包。实时行情默认走当前仓库的 xqshare 本地源码包，通过 tailscale-proxy 访问 100.87.179.78:18812；估值补充走腾讯；研报、新闻、公告、龙虎榜、解禁、行业等走仓库 Python 模块和公开数据源。
origin: repo
version: 3.0
---

# A股本地数据工具包

## Scope

这个 skill 只做路由和契约说明。所有可执行 Python 实现必须放在当前仓库的 `src/stock_data/`，不要在 `SKILL.md` 内嵌大段脚本。

## Runtime

当前仓库已使用本地 `.venv`：

```bash
cd /Users/lizhengda/develop/persinal/投研
.venv/bin/python -m pip install -r requirements.txt
```

`xqshare` 不是公共 PyPI / 组件 hub 包，必须从本仓库源码路径 `tools/xqshare` 以 editable 方式安装。默认连接配置在 `.env`：

- `XQSHARE_REMOTE_HOST=100.87.179.78`
- `XQSHARE_REMOTE_PORT=18812`
- `XQSHARE_TAILSCALE=1`

## Python Entrypoints

- `src/stock_data/codes.py`: 代码格式归一化。
- `src/stock_data/quotes.py`: xqshare 实时 tick / K线。
- `src/stock_data/tencent.py`: 腾讯 PE/PB/市值/换手率/涨跌停补充字段。
- `src/stock_data/valuation.py`: xqshare 实时价 + 腾讯估值补充 + akshare 预期的组合估值。
- `src/stock_data/cli.py`: 本地 CLI。

CLI 示例：

```bash
PYTHONPATH=src .venv/bin/python -m stock_data.cli tick --codes 000001.SZ,600000.SH
PYTHONPATH=src .venv/bin/python -m stock_data.cli valuation-fields --codes 000001,600000
PYTHONPATH=src .venv/bin/python -m stock_data.cli valuation --code 600519
```

## Source Policy

- 实时价格、盘口、K线、逐笔：优先 `xqshare`。
- PE/PB/市值/换手率/涨跌停：腾讯财经补充。
- 研报、新闻、公告、龙虎榜、解禁、行业：继续用本地 Python 模块封装公开接口；新增实现时放进 `src/stock_data/`，不要写回本 skill。
- `iwencai` 只用于 NL 主题研报搜索，需要环境变量鉴权。

## Output Policy

做个股分析时默认按“先数据、后判断、再给条件化跟踪”输出。缺数据要明确说明，不要用估计值填充成已验证事实。
