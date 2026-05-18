#!/usr/bin/env python3
"""Fetch A-share realtime ticks through xqshare."""

from __future__ import annotations

import argparse
import json

from stock_data.quotes import fetch_ticks


def parse_codes(raw: str) -> list[str]:
    return [code.strip() for code in raw.split(",") if code.strip()]


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch realtime A-share tick data through xqshare.")
    parser.add_argument("--codes", required=True, help="Comma-separated stock codes, e.g. 000001.SZ,600000.SH")
    parser.add_argument("--host", help="xqshare server host. Defaults to XQSHARE_REMOTE_HOST.")
    parser.add_argument("--port", type=int, help="xqshare server port. Defaults to XQSHARE_REMOTE_PORT or 18812.")
    parser.add_argument("--secret", help="xqshare client secret. Defaults to XQSHARE_CLIENT_SECRET.")
    parser.add_argument("--tailscale", action="store_true", help="Start the xqshare Tailscale client sidecar.")
    args = parser.parse_args()

    ticks = fetch_ticks(
        parse_codes(args.codes),
        host=args.host,
        port=args.port,
        secret=args.secret,
        use_tailscale=args.tailscale or None,
    )
    print(json.dumps(ticks, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
