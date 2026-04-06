"""
Future: persist discovery snapshots per meter / firmware profile (JSON file, S3, or DB).

v1 returns catalogs only in the HTTP envelope; nothing is written here.
"""


from __future__ import annotations

from typing import Any, Dict


def save_discovery_snapshot_placeholder(_meter_id: str, _catalog: Dict[str, Any]) -> None:
    """Reserved for durable cache; not implemented in v1."""
    raise NotImplementedError(
        "Discovery snapshots are not persisted yet. Use the API response or add storage in a later phase."
    )
