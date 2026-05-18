"""Tencent quote API adapter for valuation-only fields."""

from __future__ import annotations

import urllib.request
from typing import Any

from .codes import strip_market, tencent_prefix


def _to_float(value: str) -> float:
    try:
        return float(value) if value else 0.0
    except ValueError:
        return 0.0


def fetch_valuation_fields(codes: list[str]) -> dict[str, dict[str, Any]]:
    """Fetch PE/PB/market-cap/limit-price fields from Tencent."""
    prefixed = [tencent_prefix(code) for code in codes]
    url = "https://qt.gtimg.cn/q=" + ",".join(prefixed)
    req = urllib.request.Request(url)
    req.add_header("User-Agent", "Mozilla/5.0")
    resp = urllib.request.urlopen(req, timeout=10)
    data = resp.read().decode("gbk")

    result: dict[str, dict[str, Any]] = {}
    for line in data.strip().split(";"):
        if not line.strip() or "=" not in line or '"' not in line:
            continue
        key = line.split("=")[0].split("_")[-1]
        vals = line.split('"')[1].split("~")
        if len(vals) < 53:
            continue
        code = strip_market(key)
        result[code] = {
            "name": vals[1],
            "price_reference": _to_float(vals[3]),
            "last_close": _to_float(vals[4]),
            "open": _to_float(vals[5]),
            "change_amt": _to_float(vals[31]),
            "change_pct": _to_float(vals[32]),
            "high": _to_float(vals[33]),
            "low": _to_float(vals[34]),
            "amount_wan": _to_float(vals[37]),
            "turnover_pct": _to_float(vals[38]),
            "pe_ttm": _to_float(vals[39]),
            "amplitude_pct": _to_float(vals[43]),
            "mcap_yi": _to_float(vals[44]),
            "float_mcap_yi": _to_float(vals[45]),
            "pb": _to_float(vals[46]),
            "limit_up": _to_float(vals[47]),
            "limit_down": _to_float(vals[48]),
            "vol_ratio": _to_float(vals[49]),
            "pe_static": _to_float(vals[52]),
        }
    return result
