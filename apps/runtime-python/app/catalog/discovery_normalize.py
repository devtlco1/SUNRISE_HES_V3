"""
Normalize Gurux `GXDLMSObject` entries from an association `objectList` into JSON-safe rows.

No persistence here — see `snapshot_placeholder.py` for a future disk/DB hook.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def gurux_object_to_row(obj: Any) -> Dict[str, Any]:
    """One catalog row; omit empty optional fields."""
    row: Dict[str, Any] = {
        "classId": int(getattr(obj, "objectType", 0)),
        "obis": str(getattr(obj, "logicalName", "") or ""),
        "version": int(getattr(obj, "version", 0)),
    }
    ot = getattr(obj, "objectType", None)
    if ot is not None:
        row["classIdName"] = str(ot)

    desc = getattr(obj, "description", None)
    if isinstance(desc, str) and desc.strip():
        row["description"] = desc.strip()

    sn = getattr(obj, "shortName", None)
    if sn is not None and int(sn) != 0:
        row["shortName"] = int(sn)

    return row


def normalize_object_list(object_list: Any) -> List[Dict[str, Any]]:
    """Iterate Gurux `GXDLMSObjectCollection` or list-like."""
    out: List[Dict[str, Any]] = []
    if object_list is None:
        return out
    try:
        items = list(object_list)
    except TypeError:
        return out
    for it in items:
        try:
            out.append(gurux_object_to_row(it))
        except Exception:  # noqa: BLE001
            out.append({"obis": "", "classId": -1, "version": 0, "error": "normalize_failed"})
    return out
