"""
COSEM OBIS logical-name shape for MVP-AMI / Gurux (six decimal groups, 0–255).

Malformed strings (e.g. ``81.7.40.255`` missing ``1.0.``) must never reach the DLMS stack.
"""

from __future__ import annotations

from typing import Tuple

# Operator-facing; keep short (UI / envelope row error).
OBIS_SHAPE_INVALID_MESSAGE = (
    "Invalid OBIS — COSEM logical name needs six dot-separated groups (0–255 each)."
)


def obis_logical_name_structurally_valid(obis: str) -> Tuple[bool, str]:
    """
    True if `obis` matches the six-group decimal pattern used for on-wire COSEM reads.

    Returns (False, machine_tag) when invalid; `machine_tag` is for logs only.
    """
    s = (obis or "").strip()
    if not s:
        return False, "OBIS_EMPTY"
    parts = s.split(".")
    if len(parts) != 6:
        return False, f"OBIS_GROUP_COUNT_{len(parts)}"
    for p in parts:
        if not p.isdigit():
            return False, "OBIS_NON_NUMERIC"
        v = int(p)
        if v < 0 or v > 255:
            return False, "OBIS_GROUP_RANGE"
    return True, ""
