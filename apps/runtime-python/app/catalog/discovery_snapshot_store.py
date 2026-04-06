"""
File-backed JSON persistence for `discover-supported-obis` results.

Layout (per meter):
  {snapshot_dir}/{safe_meter_id}/latest.json
  {snapshot_dir}/{safe_meter_id}/history/{capturedAtUtc_sanitized}.json

Replaceable later with Redis/DB without changing HTTP snapshot record shape.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from pathlib import Path
from typing import Any, List, Optional

from app.schemas.discovery_snapshot import (
    DiscoverySnapshotListItem,
    DiscoverySnapshotRecord,
)
from app.schemas.envelope import DiscoverSupportedObisPayload
from app.schemas.requests import ChannelSpec, DiscoverSupportedObisRequest

log = logging.getLogger(__name__)

_METER_SAFE = re.compile(r"^[\w.-]{1,128}$")


def sanitize_meter_id(meter_id: str) -> str:
    mid = meter_id.strip()
    if not _METER_SAFE.match(mid):
        raise ValueError("INVALID_METER_ID")
    return mid


def default_snapshot_base_dir() -> Path:
    """`apps/runtime-python/data/discovery-snapshots` (sidecar process cwd may vary — prefer env)."""
    return Path(__file__).resolve().parents[2] / "data" / "discovery-snapshots"


def resolve_snapshot_dir(configured: str) -> Path:
    if configured and configured.strip():
        return Path(configured.strip()).expanduser().resolve()
    return default_snapshot_base_dir()


def compute_profile_fingerprint(
    *,
    adapter: str,
    discovery_association_ln: str,
    mvp_ami_config_path: Optional[str],
    mvp_ami_root: Optional[str],
) -> str:
    parts = [
        f"adapter={adapter}",
        f"assoc_ln={discovery_association_ln}",
        f"root={mvp_ami_root or ''}",
    ]
    cfg_digest = "no_config_file"
    if mvp_ami_config_path:
        p = Path(mvp_ami_config_path).expanduser()
        if p.is_file():
            h = hashlib.sha256()
            h.update(p.read_bytes())
            cfg_digest = h.hexdigest()
        else:
            cfg_digest = f"missing:{mvp_ami_config_path}"
    parts.append(f"config_sha256={cfg_digest}")
    raw = "|".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def channel_context_from_request(channel: Optional[ChannelSpec]) -> Optional[dict[str, Any]]:
    if channel is None:
        return None
    ctx: dict[str, Any] = {"type": channel.type}
    if channel.devicePath:
        ctx["devicePath"] = channel.devicePath
    if channel.host is not None:
        ctx["host"] = channel.host
    if channel.port is not None:
        ctx["port"] = channel.port
    return ctx


def build_record_from_discovery(
    *,
    request: DiscoverSupportedObisRequest,
    payload: DiscoverSupportedObisPayload,
    captured_at_utc: str,
    profile_fingerprint: str,
    simulated: bool,
    runtime_adapter: str,
    discovery_finished_at: Optional[str],
) -> DiscoverySnapshotRecord:
    return DiscoverySnapshotRecord(
        meterId=request.meterId.strip(),
        capturedAtUtc=captured_at_utc,
        associationLogicalName=payload.associationLogicalName,
        totalCount=payload.totalCount,
        objects=list(payload.objects),
        source=payload.source,
        profileFingerprint=profile_fingerprint,
        simulated=simulated,
        runtimeAdapter=runtime_adapter,
        channelContext=channel_context_from_request(request.channel),
        discoveryFinishedAt=discovery_finished_at,
    )


def save_snapshot(base_dir: Path, record: DiscoverySnapshotRecord, max_history: int) -> None:
    safe = sanitize_meter_id(record.meterId)
    root = Path(base_dir).expanduser().resolve()
    meter_dir = root / safe
    history_dir = meter_dir / "history"
    history_dir.mkdir(parents=True, exist_ok=True)

    # Filename safe from ISO timestamp
    fn = record.capturedAtUtc.replace(":", "-").replace("+00:00", "Z")
    hist_path = history_dir / f"{fn}.json"
    latest_path = meter_dir / "latest.json"

    text = json.dumps(record.model_dump(mode="json"), indent=2, ensure_ascii=False)
    hist_path.write_text(text, encoding="utf-8")
    latest_path.write_text(text, encoding="utf-8")

    log.info("discovery_snapshot_saved", extra={"meter_id": safe, "path": str(latest_path)})

    # Trim oldest history files
    if max_history > 0:
        files = sorted(history_dir.glob("*.json"), key=lambda p: p.stat().st_mtime)
        while len(files) > max_history:
            oldest = files.pop(0)
            try:
                oldest.unlink()
            except OSError:
                break


def load_latest(base_dir: Path, meter_id: str) -> Optional[DiscoverySnapshotRecord]:
    safe = sanitize_meter_id(meter_id)
    path = Path(base_dir).expanduser().resolve() / safe / "latest.json"
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return DiscoverySnapshotRecord.model_validate(data)


def list_snapshots(base_dir: Path, meter_id: str) -> List[DiscoverySnapshotListItem]:
    safe = sanitize_meter_id(meter_id)
    root = Path(base_dir).expanduser().resolve() / safe
    history_dir = root / "history"
    items: List[DiscoverySnapshotListItem] = []
    if history_dir.is_dir():
        for p in sorted(history_dir.glob("*.json"), key=lambda x: x.stat().st_mtime, reverse=True):
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                items.append(
                    DiscoverySnapshotListItem(
                        capturedAtUtc=str(data.get("capturedAtUtc", "")),
                        storedAs=f"history/{p.name}",
                    )
                )
            except Exception:  # noqa: BLE001
                continue
    if not items:
        latest = load_latest(base_dir, meter_id)
        if latest is not None:
            items.append(
                DiscoverySnapshotListItem(
                    capturedAtUtc=latest.capturedAtUtc,
                    storedAs="latest.json",
                )
            )
    return items
