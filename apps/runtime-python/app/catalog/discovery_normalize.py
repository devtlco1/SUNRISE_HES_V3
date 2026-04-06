"""
Normalize Gurux `GXDLMSObject` entries from an association `objectList` into JSON-safe rows.

Persistence: `app/catalog/discovery_snapshot_store.py` (file-backed JSON).
"""

from __future__ import annotations

from dataclasses import dataclass, field
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


MAX_DROP_REASON_SAMPLES = 24


@dataclass
class ObjectListNormalizationReport:
    """Counters for association object-list normalization (honest empty vs dropped)."""

    normalization_decision: str
    """input_none | not_iterable | normalized_ok"""
    raw_input_count: int
    normalized_output_count: int
    dropped_or_failed_count: int
    drop_reasons_sample: List[Dict[str, Any]] = field(default_factory=list)


def normalize_object_list_with_report(object_list: Any) -> tuple[List[Dict[str, Any]], ObjectListNormalizationReport]:
    out: List[Dict[str, Any]] = []
    reasons: List[Dict[str, Any]] = []

    if object_list is None:
        return out, ObjectListNormalizationReport(
            normalization_decision="input_none",
            raw_input_count=0,
            normalized_output_count=0,
            dropped_or_failed_count=0,
            drop_reasons_sample=[],
        )

    try:
        items = list(object_list)
    except TypeError:
        return out, ObjectListNormalizationReport(
            normalization_decision="not_iterable",
            raw_input_count=0,
            normalized_output_count=0,
            dropped_or_failed_count=0,
            drop_reasons_sample=[
                {
                    "index": -1,
                    "reason": "list(object_list) raised TypeError",
                    "itemPythonType": type(object_list).__name__,
                }
            ],
        )

    raw_input_count = len(items)
    for idx, it in enumerate(items):
        try:
            out.append(gurux_object_to_row(it))
        except Exception as exc:  # noqa: BLE001
            out.append({"obis": "", "classId": -1, "version": 0, "error": "normalize_failed"})
            if len(reasons) < MAX_DROP_REASON_SAMPLES:
                reasons.append(
                    {
                        "index": idx,
                        "reason": "normalize_failed",
                        "error": str(exc),
                        "itemPythonType": type(it).__name__,
                    }
                )

    dropped = sum(1 for r in out if r.get("error") == "normalize_failed")
    return out, ObjectListNormalizationReport(
        normalization_decision="normalized_ok",
        raw_input_count=raw_input_count,
        normalized_output_count=len(out),
        dropped_or_failed_count=dropped,
        drop_reasons_sample=reasons,
    )


def normalize_object_list(object_list: Any) -> List[Dict[str, Any]]:
    """Iterate Gurux `GXDLMSObjectCollection` or list-like (legacy API — no report)."""
    rows, _ = normalize_object_list_with_report(object_list)
    return rows


def association_view_debug_note(
    *,
    read_ok: bool,
    post_len_probe: Optional[Dict[str, Any]],
    report: ObjectListNormalizationReport,
) -> str:
    """Short operator-facing sentence; not a substitute for structured fields."""
    if not read_ok:
        return "Association LN attribute 2 read did not complete successfully; raw objectList may be stale or unset."
    pl = (post_len_probe or {}).get("count")
    if report.normalization_decision == "input_none":
        return "After read, Gurux association objectList was None; nothing to normalize."
    if report.normalization_decision == "not_iterable":
        return "objectList was not iterable as expected; check Gurux type/shape (see rawObjectList* fields)."
    if pl == 0 and report.raw_input_count == 0:
        return (
            "On-wire read succeeded; length probe reports zero elements in objectList before normalization — "
            "meter may expose an empty association view for this LN, or Gurux did not populate objectList."
        )
    if report.dropped_or_failed_count > 0:
        return (
            f"Normalization produced {report.normalized_output_count} rows from "
            f"{report.raw_input_count} raw entries; {report.dropped_or_failed_count} failed row conversions."
        )
    if report.raw_input_count > 0 and report.normalized_output_count == report.raw_input_count:
        return (
            f"All {report.raw_input_count} raw objectList entries were normalized without row-level failures."
        )
    return "See normalizationDecision and length probes for details."
