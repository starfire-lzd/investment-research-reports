"""Realtime quote access through local xqshare."""

from __future__ import annotations

from typing import Any, Optional

from .codes import normalize_code
from .utils import run_xtdata


def _normalize_tick(xt_code: str, tick: dict[str, Any]) -> dict[str, Any]:
    last_price = tick.get("lastPrice", 0) or 0
    last_close = tick.get("lastClose", 0) or 0
    change_amt = last_price - last_close if last_close else 0

    return {
        "code": xt_code.split(".", 1)[0],
        "xt_code": xt_code,
        "time": tick.get("timetag") or tick.get("time"),
        "price": last_price,
        "last_close": last_close,
        "open": tick.get("open", 0) or 0,
        "high": tick.get("high", 0) or 0,
        "low": tick.get("low", 0) or 0,
        "change_amt": change_amt,
        "change_pct": change_amt / last_close * 100 if last_close else 0,
        "amount": tick.get("amount", 0) or 0,
        "volume": tick.get("volume", 0) or 0,
        "pvolume": tick.get("pvolume", 0) or 0,
        "bidPrice": tick.get("bidPrice", []) or [],
        "bidVol": tick.get("bidVol", []) or [],
        "askPrice": tick.get("askPrice", []) or [],
        "askVol": tick.get("askVol", []) or [],
        "raw": tick,
    }


def fetch_ticks(
    codes: list[str],
    host: Optional[str] = None,
    port: Optional[int] = None,
    secret: Optional[str] = None,
    use_tailscale: Optional[bool] = None,
) -> dict[str, dict[str, Any]]:
    """Fetch realtime ticks from xqshare and return a dict keyed by plain code."""
    xt_codes = [normalize_code(code) for code in codes]
    raw = run_xtdata(
        lambda xtdata: xtdata.get_full_tick(xt_codes) or {},
        host=host,
        port=port,
        secret=secret,
        use_tailscale=use_tailscale,
    )

    return {xt_code.split(".", 1)[0]: _normalize_tick(xt_code, tick) for xt_code, tick in raw.items()}


def fetch_klines(code: str, period: str = "1d", count: int = 20):
    """Fetch K-line data through xtquant via xqshare."""
    return run_xtdata(lambda xtdata: xtdata.get_market_data_ex([], [normalize_code(code)], period=period, count=count))
