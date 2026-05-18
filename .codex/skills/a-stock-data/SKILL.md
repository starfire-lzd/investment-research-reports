---
name: a-stock-data
description: A股本地数据工具包。实时行情默认走当前仓库的 xqshare 本地源码包，通过 tailscale-proxy 访问 100.87.179.78:18812；估值补充走腾讯；研报、新闻、公告、龙虎榜、解禁、行业等走仓库 Python 模块和公开数据源。
origin: repo
version: 4.0
---

# A股本地数据工具包

## Scope

这个 skill 是当前仓库对 `xqshare` / `xtquant.xtdata` 的 A 股数据入口。它只做路由和契约说明；所有可执行 Python 实现必须放在当前仓库的 `src/stock_data/`，不要在 `SKILL.md` 内嵌大段脚本。

核心原则：A 股行情、板块、合约、交易日历、财务、历史下载、Level2 等理论上优先通过 `xqshare` 远程代理获取。公开 HTTP 数据源只作为 `xtdata` 不覆盖或字段不足时的补充。

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
- `src/stock_data/utils.py`: xqshare 连接、代码归一化、DataFrame/对象序列化等通用能力。
- `src/stock_data/xtdata.py`: 按官方 xtdata 接口名提供直接调用函数，例如 `get_full_kline()`、`get_financial_data()`、`get_instrument_detail()`。
- `src/stock_data/quotes.py`: xqshare 实时 tick / K线。
- `src/stock_data/tencent.py`: 腾讯 PE/PB/市值/换手率/涨跌停补充字段。
- `src/stock_data/valuation.py`: xqshare 实时价 + 腾讯估值补充 + akshare 预期的组合估值。
- `src/stock_data/cli.py`: 本地 CLI。

CLI 示例：

```bash
PYTHONPATH=src .venv/bin/python -m stock_data.cli sectors
PYTHONPATH=src .venv/bin/python -m stock_data.cli stocks --sector 沪深A股
PYTHONPATH=src .venv/bin/python -m stock_data.cli tick --codes 000001.SZ,600000.SH
PYTHONPATH=src .venv/bin/python -m stock_data.cli kline --codes 000001,600000 --period 1d --count 20
PYTHONPATH=src .venv/bin/python -m stock_data.cli full-kline --codes 000001,600000 --period 1m --count 1
PYTHONPATH=src .venv/bin/python -m stock_data.cli download-history --codes 000001,600000 --period 1d
PYTHONPATH=src .venv/bin/python -m stock_data.cli financial --codes 000001 --tables Balance,Income,CashFlow
PYTHONPATH=src .venv/bin/python -m stock_data.cli calendar --market SH --start 20260101 --end 20260131
PYTHONPATH=src .venv/bin/python -m stock_data.cli valuation-fields --codes 000001,600000
PYTHONPATH=src .venv/bin/python -m stock_data.cli valuation --code 600519
```

Python 示例：

```python
from stock_data.xtdata import get_financial_data, get_full_kline, get_market_data_ex, get_stock_list_in_sector

stocks = get_stock_list_in_sector("沪深A股")
kline = get_market_data_ex(stock_list=["000001", "600000"], period="1d", count=20)
latest = get_full_kline(stock_list=["000001", "600000"], period="1m", count=1)
financial = get_financial_data(stock_list=["000001"], table_list=["Balance", "Income", "CashFlow"])
```

## xtdata Capability Map

优先使用 `src/stock_data/xtdata.py`。该文件按官方 xtdata 接口名暴露直接调用函数；通用连接、归一化和序列化能力放在 `src/stock_data/utils.py`。

| 类别 | API / 能力 |
| --- | --- |
| 行情快照 | `get_full_tick`, `get_transactioncount`, `get_fullspeed_orderbook` |
| K 线 / 历史行情 | `get_market_data`, `get_market_data_ex`, `get_local_data` |
| 最新交易日 K 线 | `get_full_kline`，适合取当日/最新交易日全推 K 线切片；CLI: `full-kline` |
| Level2 | `get_l2_quote`, `get_l2_order`, `get_l2_transaction`, `get_l2thousand_queue` |
| 数据下载 | `download_history_data`, `download_history_data2`, `download_financial_data`, `download_financial_data2` |
| 板块 / 指数权重 | `get_sector_list`, `get_sector_info`, `get_stock_list_in_sector`, `download_sector_data`, `get_index_weight`, `download_index_weight` |
| 基础行情信息 | `get_instrument_detail`, `get_instrument_detail_list`, `get_instrument_type`, `get_markets`, `get_period_list`, `get_ipo_info` |
| 交易日历 / 除权 | `get_trading_dates`, `get_trading_calendar`, `get_holidays`, `get_divid_factors` |
| 财务 | `get_financial_data`；查询前通常先 `download_financial_data2` |
| 可转债 / ETF / ST | `get_cb_info`, `get_etf_info`, `get_his_st_data` |
| 期货 / 期权 / 主力 | `get_main_contract`, `get_sec_main_contract`, `get_option_detail_data`, `get_option_undl_data`, `get_option_list`, `get_his_option_list`, `get_his_option_list_batch` |
| 公式 / 扩展 | `call_formula`, `get_formula_result`, `create_formula`, `import_formula`, `del_formula`, `get_formulas` |

## Financial and Basic Quote Fields

官方 xtdata 文档把财务数据和基础行情信息作为一等能力。做 A 股个股分析时：

- 财务数据优先走 `download_financial_data2` + `get_financial_data`，常用表包括 `Balance`、`Income`、`CashFlow`、`PershareIndex`、`Capital`、`Top10holder`、`Top10flowholder`、`Holdernum`。
- 合约/股票基础信息优先走 `get_instrument_detail` 或 `get_instrument_detail_list`，可拿名称、交易所、上市日、前收、涨跌停价、流通股本、总股本、价格最小变动单位、交易状态等字段。
- 板块和指数权重优先走 `get_stock_list_in_sector`、`get_sector_list`、`get_index_weight`；板块分类数据较静态，可按日或按周下载刷新。
- 最新交易日切片优先走 `get_full_kline`，它不同于历史 K 线查询，适合拉当前/最新交易日的全推 K 线数据；若要稳定回测或长窗口分析，仍使用 `download_history_data2` + `get_market_data_ex`。

直接接口默认会把股票参数归一化为 `000001.SZ` 形式。指数、期货、期权、特殊市场代码如不能按 A 股规则归一化，优先保留官方格式并在 `xtdata.py` 中为该接口单独处理。

订阅 / 回调类 API（如 `subscribe_quote`, `subscribe_whole_quote`, `subscribe_l2thousand`, `bind_formula`）需要长生命周期和 callback 管理，默认不走本仓库 CLI 的通用入口；需要时直接使用 `xqshare` Python API 写专用模块。

## Source Policy

- 实时价格、盘口、K线、逐笔、板块成分、合约信息、交易日历、财务下载/查询：优先 `xqshare`。
- PE/PB/市值/换手率/涨跌停：`xtdata` 不稳定或缺字段时用腾讯财经补充。
- 研报、新闻、公告、龙虎榜、解禁、行业：继续用本地 Python 模块封装公开接口；新增实现时放进 `src/stock_data/`，不要写回本 skill。
- `iwencai` 只用于 NL 主题研报搜索，需要环境变量鉴权。

## Data Freshness Policy

- 查询 K 线前，如返回空或明显旧数据，先调用 `download_history_data2` 下载基础周期：`1d`、`1m`、`5m`。
- 查询财务前，先调用 `download_financial_data2` 下载所需表：常用 `Balance`、`Income`、`CashFlow`。
- 分钟派生周期（如 `15m`, `30m`, `60m`）通常由基础周期聚合，优先下载 `1m` 或 `5m`。
- 输出带科学计数法的大额字段时，必须转成完整数字或“万/亿”单位后再解释。

## Output Policy

做个股分析时默认按“先数据、后判断、再给条件化跟踪”输出。缺数据要明确说明，不要用估计值填充成已验证事实。
