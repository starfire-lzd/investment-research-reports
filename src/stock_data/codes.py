"""Ticker normalization helpers."""


def normalize_code(code: str) -> str:
    """Normalize common A-share inputs to xtquant format, e.g. 000001.SZ."""
    c = code.strip().upper()
    if "." in c:
        raw, market = c.split(".", 1)
        return f"{raw[-6:]}.{market[:2]}"
    if c.startswith(("SH", "SZ", "BJ")):
        return f"{c[-6:]}.{c[:2]}"

    raw = c[-6:]
    if raw.startswith(("6", "9")):
        return f"{raw}.SH"
    if raw.startswith("8"):
        return f"{raw}.BJ"
    return f"{raw}.SZ"


def strip_market(code: str) -> str:
    """Normalize to plain 6-digit code."""
    return normalize_code(code).split(".", 1)[0]


def tencent_prefix(code: str) -> str:
    """Normalize to Tencent quote prefix format, e.g. sh600000."""
    raw = strip_market(code)
    if raw.startswith(("6", "9")):
        return f"sh{raw}"
    if raw.startswith("8"):
        return f"bj{raw}"
    return f"sz{raw}"
