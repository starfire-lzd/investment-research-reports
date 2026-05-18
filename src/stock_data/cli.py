"""Command-line entrypoint for local A-share data helpers."""

from __future__ import annotations

import argparse
import json
from typing import Any

from .quotes import fetch_ticks
from .tencent import fetch_valuation_fields
from .utils import serialize_result
from .valuation import full_valuation
from .xtdata import (
    download_history_data2,
    get_financial_data,
    get_full_kline,
    get_instrument_detail,
    get_market_data_ex,
    get_sector_list,
    get_stock_list_in_sector,
    get_trading_dates,
)


def _print_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))


def _split_codes(codes: str) -> list[str]:
    return [code.strip() for code in codes.split(",") if code.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Local A-share data helpers.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    tick = subparsers.add_parser("tick", help="Fetch realtime xqshare ticks.")
    tick.add_argument("--codes", required=True, help="Comma-separated stock codes.")

    valuation_fields = subparsers.add_parser("valuation-fields", help="Fetch Tencent valuation supplement fields.")
    valuation_fields.add_argument("--codes", required=True, help="Comma-separated stock codes.")

    valuation = subparsers.add_parser("valuation", help="Run single-stock valuation.")
    valuation.add_argument("--code", required=True)

    sectors = subparsers.add_parser("sectors", help="Fetch xtdata sector names.")

    stocks = subparsers.add_parser("stocks", help="Fetch xtdata sector constituents.")
    stocks.add_argument("--sector", default="沪深A股")

    instrument = subparsers.add_parser("instrument", help="Fetch xtdata instrument detail.")
    instrument.add_argument("--code", required=True)
    instrument.add_argument("--complete", action="store_true")

    kline = subparsers.add_parser("kline", help="Fetch xtdata K-line data via get_market_data_ex.")
    kline.add_argument("--codes", required=True, help="Comma-separated stock codes.")
    kline.add_argument("--period", default="1d")
    kline.add_argument("--start", default="")
    kline.add_argument("--end", default="")
    kline.add_argument("--count", type=int, default=-1)
    kline.add_argument("--fields", default="", help="Comma-separated field list.")
    kline.add_argument("--dividend-type", default="none")

    full_kline = subparsers.add_parser("full-kline", help="Fetch latest-trading-day K-line data via get_full_kline.")
    full_kline.add_argument("--codes", required=True, help="Comma-separated stock codes.")
    full_kline.add_argument("--period", default="1m")
    full_kline.add_argument("--start", default="")
    full_kline.add_argument("--end", default="")
    full_kline.add_argument("--count", type=int, default=1)
    full_kline.add_argument("--fields", default="", help="Comma-separated field list.")
    full_kline.add_argument("--dividend-type", default="none")

    download_history = subparsers.add_parser("download-history", help="Download history data before querying K-lines.")
    download_history.add_argument("--codes", required=True, help="Comma-separated stock codes.")
    download_history.add_argument("--period", default="1d")
    download_history.add_argument("--start", default="")
    download_history.add_argument("--end", default="")
    download_history.add_argument("--incrementally", action="store_true")

    financial = subparsers.add_parser("financial", help="Fetch xtdata financial data.")
    financial.add_argument("--codes", required=True, help="Comma-separated stock codes.")
    financial.add_argument("--tables", default="", help="Comma-separated table names, e.g. Balance,Income,CashFlow.")
    financial.add_argument("--start", default="")
    financial.add_argument("--end", default="")
    financial.add_argument("--report-type", default="report_time")

    calendar = subparsers.add_parser("calendar", help="Fetch xtdata trading dates.")
    calendar.add_argument("--market", default="SH")
    calendar.add_argument("--start", default="")
    calendar.add_argument("--end", default="")
    calendar.add_argument("--count", type=int, default=-1)

    args = parser.parse_args()
    if args.command == "tick":
        _print_json(fetch_ticks(_split_codes(args.codes)))
    elif args.command == "valuation-fields":
        _print_json(fetch_valuation_fields(_split_codes(args.codes)))
    elif args.command == "valuation":
        _print_json(full_valuation(args.code))
    elif args.command == "sectors":
        _print_json(serialize_result(get_sector_list()))
    elif args.command == "stocks":
        _print_json(get_stock_list_in_sector(args.sector))
    elif args.command == "instrument":
        _print_json(serialize_result(get_instrument_detail(args.code, iscomplete=args.complete)))
    elif args.command == "kline":
        fields = _split_codes(args.fields) if args.fields else []
        data = get_market_data_ex(
            stock_list=_split_codes(args.codes),
            field_list=fields,
            period=args.period,
            start_time=args.start,
            end_time=args.end,
            count=args.count,
            dividend_type=args.dividend_type,
        )
        _print_json(serialize_result(data))
    elif args.command == "full-kline":
        fields = _split_codes(args.fields) if args.fields else []
        data = get_full_kline(
            stock_list=_split_codes(args.codes),
            field_list=fields,
            period=args.period,
            start_time=args.start,
            end_time=args.end,
            count=args.count,
            dividend_type=args.dividend_type,
        )
        _print_json(serialize_result(data))
    elif args.command == "download-history":
        _print_json(
            serialize_result(
                download_history_data2(
                    _split_codes(args.codes),
                    period=args.period,
                    start_time=args.start,
                    end_time=args.end,
                    incrementally=args.incrementally or None,
                )
            )
        )
    elif args.command == "financial":
        tables = _split_codes(args.tables) if args.tables else []
        data = get_financial_data(
            _split_codes(args.codes),
            table_list=tables,
            start_time=args.start,
            end_time=args.end,
            report_type=args.report_type,
        )
        _print_json(serialize_result(data))
    elif args.command == "calendar":
        _print_json(
            serialize_result(
                get_trading_dates(
                    market=args.market,
                    start_time=args.start,
                    end_time=args.end,
                    count=args.count,
                )
            )
        )

if __name__ == "__main__":
    main()
