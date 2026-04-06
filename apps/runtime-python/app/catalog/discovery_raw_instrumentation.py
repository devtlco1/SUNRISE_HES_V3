"""
Bounded raw evidence for Association LN object-list (attribute 2) reads.

Does not dump full wire buffers; caps repr length and iteration counts.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

MAX_REPR_PREVIEW = 480
MAX_ITERATION_COUNT = 5000


def safe_repr_preview(obj: Any, max_len: int = MAX_REPR_PREVIEW) -> str:
    try:
        s = repr(obj)
    except Exception as exc:  # noqa: BLE001
        return f"<repr() failed: {exc!s}>"
    if len(s) > max_len:
        return s[: max_len - 3] + "..."
    return s


def _python_type_parts(obj: Any) -> tuple[str, str]:
    t = type(obj)
    return t.__name__, getattr(t, "__qualname__", t.__name__)


def probe_object_list_length(obj: Any) -> Dict[str, Any]:
    """
    Best-effort length for Gurux collections; avoids materializing huge lists when __len__ exists.
    """
    if obj is None:
        return {"count": None, "method": "value_is_none"}

    if hasattr(obj, "__len__"):
        try:
            n = int(len(obj))  # type: ignore[arg-type]
            return {"count": n, "method": "__len__", "capped": False}
        except Exception as exc:  # noqa: BLE001
            return {"count": None, "method": f"__len__ raised: {exc!s}"}

    n = 0
    try:
        for _ in obj:
            n += 1
            if n >= MAX_ITERATION_COUNT:
                return {
                    "count": MAX_ITERATION_COUNT,
                    "method": "iteration",
                    "capped": True,
                    "note": f"stopped at {MAX_ITERATION_COUNT} for safety",
                }
    except Exception as exc:  # noqa: BLE001
        return {"count": None, "method": f"iteration failed: {exc!s}"}

    return {"count": n, "method": "iteration", "capped": False}


def summarize_object_list_value(obj: Any, *, label: str) -> Dict[str, Any]:
    """Single snapshot of one Python value (e.g. assoc_obj.objectList before/after read)."""
    py_name, py_qual = _python_type_parts(obj)
    return {
        "label": label,
        "pythonType": py_name,
        "pythonTypeQualname": py_qual,
        "reprPreview": safe_repr_preview(obj),
        "lengthProbe": probe_object_list_length(obj),
    }


def merge_pre_post_summaries(
    pre: Optional[Dict[str, Any]], post: Optional[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    if pre:
        out.append(pre)
    if post:
        out.append(post)
    return out
