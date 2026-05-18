"""Shared utilities for local A-share data adapters."""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date, datetime
from typing import Any, Callable, Iterator, Optional, TypeVar

from xqshare import XtQuantRemote

from .codes import normalize_code


T = TypeVar("T")


@contextmanager
def xtdata_client(
    host: Optional[str] = None,
    port: Optional[int] = None,
    secret: Optional[str] = None,
    client_id: Optional[str] = None,
    use_tailscale: Optional[bool] = None,
) -> Iterator[XtQuantRemote]:
    """Create an xqshare client using explicit args or XQSHARE_* env vars."""
    xt = XtQuantRemote(
        host=host,
        port=port,
        client_secret=secret,
        client_id=client_id,
        use_tailscale=use_tailscale,
    )
    try:
        yield xt
    finally:
        xt.close()


def run_xtdata(
    operation: Callable[[Any], T],
    host: Optional[str] = None,
    port: Optional[int] = None,
    secret: Optional[str] = None,
    client_id: Optional[str] = None,
    use_tailscale: Optional[bool] = None,
) -> T:
    """Run a callable against ``xt.xtdata`` and close the remote client."""
    with xtdata_client(host=host, port=port, secret=secret, client_id=client_id, use_tailscale=use_tailscale) as xt:
        return operation(xt.xtdata)


def normalize_stock_code(code: str) -> str:
    return normalize_code(code)


def normalize_stock_list(codes: list[str] | tuple[str, ...] | set[str]) -> list[str]:
    return [normalize_code(str(code)) for code in codes]


def compact_kwargs(params: dict[str, Any]) -> dict[str, Any]:
    """Drop None values before calling xtdata to avoid signature mismatches."""
    return {key: value for key, value in params.items() if value is not None}


def serialize_result(result: Any, include_index: bool = True) -> Any:
    """Convert common xtdata return values into JSON-friendly Python objects."""
    try:
        import pandas as pd
    except ImportError:  # pragma: no cover - pandas is in repo requirements.
        pd = None

    if result is None:
        return None
    if pd is not None and isinstance(result, pd.DataFrame):
        frame = result.reset_index() if include_index else result
        return frame.to_dict(orient="records")
    if isinstance(result, dict):
        return {str(key): serialize_result(value, include_index=include_index) for key, value in result.items()}
    if isinstance(result, (list, tuple, set)):
        return [serialize_result(item, include_index=include_index) for item in result]
    if isinstance(result, (datetime, date)):
        return result.isoformat()
    if hasattr(result, "__dict__"):
        return {
            key: serialize_result(value, include_index=include_index)
            for key, value in vars(result).items()
            if not key.startswith("_")
        }
    return result
