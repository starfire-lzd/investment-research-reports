"""Valuation helpers that combine xqshare realtime price with public fundamentals."""

from __future__ import annotations

import math
from typing import Any, Optional

from .codes import strip_market
from .quotes import fetch_ticks
from .tencent import fetch_valuation_fields


def forward_pe(price: float, eps_forecast: Optional[float]) -> float:
    if not eps_forecast or eps_forecast <= 0:
        return float("inf")
    return price / eps_forecast


def pe_digestion(current_pe: float, cagr: float, target_pe: float = 30) -> float:
    if current_pe <= target_pe:
        return 0.0
    if cagr <= 0:
        return float("inf")
    return math.log(current_pe / target_pe) / math.log(1 + cagr)


def calc_peg(pe: float, cagr: float) -> float:
    if cagr <= 0:
        return float("inf")
    return pe / (cagr * 100)


def full_valuation(code: str) -> dict[str, Any]:
    """Single-stock valuation using xqshare as realtime price source."""
    import akshare as ak

    pure_code = strip_market(code)
    live = fetch_ticks([pure_code])[pure_code]
    valuation = fetch_valuation_fields([pure_code]).get(pure_code, {})

    df = ak.stock_profit_forecast_ths(symbol=pure_code, indicator="预测年报每股收益")
    eps_cur = None
    eps_next = None
    analyst_count = 0
    if not df.empty and "年度" in df.columns:
        years_sorted = sorted(df["年度"].unique())
        for _, row in df.iterrows():
            year = str(row["年度"])
            if len(years_sorted) > 0 and year == str(years_sorted[0]):
                eps_cur = float(row["均值"])
                analyst_count = int(row["预测机构数"])
            elif len(years_sorted) > 1 and year == str(years_sorted[1]):
                eps_next = float(row["均值"])

    price = live["price"]
    pe_fwd = forward_pe(price, eps_cur)
    cagr = (eps_next / eps_cur - 1) if eps_cur and eps_next else 0
    peg = calc_peg(pe_fwd, cagr)
    digest = pe_digestion(pe_fwd, cagr)

    return {
        "code": pure_code,
        "name": valuation.get("name", ""),
        "source": "xqshare",
        "quote_time": live.get("time"),
        "price": price,
        "change_pct": live.get("change_pct"),
        "mcap_yi": valuation.get("mcap_yi", 0),
        "pe_ttm": valuation.get("pe_ttm", 0),
        "pb": valuation.get("pb", 0),
        "eps_cur": eps_cur,
        "eps_next": eps_next,
        "pe_fwd": round(pe_fwd, 1) if pe_fwd != float("inf") else None,
        "cagr_pct": round(cagr * 100, 0) if cagr else None,
        "peg": round(peg, 2) if peg != float("inf") else None,
        "digest_years": round(digest, 1) if digest != float("inf") else None,
        "analyst_count": analyst_count,
    }
