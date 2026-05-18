"""Command-line entrypoint for local A-share data helpers."""

from __future__ import annotations

import argparse
import json
from typing import Any

from .quotes import fetch_ticks
from .tencent import fetch_valuation_fields
from .valuation import full_valuation


def _print_json(data: Any) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2, default=str))


def main() -> None:
    parser = argparse.ArgumentParser(description="Local A-share data helpers.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    tick = subparsers.add_parser("tick", help="Fetch realtime xqshare ticks.")
    tick.add_argument("--codes", required=True, help="Comma-separated stock codes.")

    valuation_fields = subparsers.add_parser("valuation-fields", help="Fetch Tencent valuation supplement fields.")
    valuation_fields.add_argument("--codes", required=True, help="Comma-separated stock codes.")

    valuation = subparsers.add_parser("valuation", help="Run single-stock valuation.")
    valuation.add_argument("--code", required=True)

    args = parser.parse_args()
    if args.command == "tick":
        _print_json(fetch_ticks([c.strip() for c in args.codes.split(",") if c.strip()]))
    elif args.command == "valuation-fields":
        _print_json(fetch_valuation_fields([c.strip() for c in args.codes.split(",") if c.strip()]))
    elif args.command == "valuation":
        _print_json(full_valuation(args.code))


if __name__ == "__main__":
    main()
