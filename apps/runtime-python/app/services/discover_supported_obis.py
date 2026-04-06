"""Application service for association-view discovery (delegates to protocol adapter)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.adapters.factory import get_runtime_adapter
from app.catalog.discovery_snapshot_store import (
    build_record_from_discovery,
    compute_profile_fingerprint,
    resolve_snapshot_dir,
    save_snapshot,
)
from app.config import get_settings
from app.schemas.envelope import DiscoverSupportedObisPayload, RuntimeResponseEnvelope
from app.schemas.requests import DiscoverSupportedObisRequest

log = logging.getLogger(__name__)


def _resolved_config_path_for_fingerprint() -> Optional[str]:
    s = get_settings()
    raw = (s.mvp_ami_config_path or "").strip()
    if raw:
        return raw
    root = (s.mvp_ami_root or "").strip()
    if root:
        return str(Path(root) / "config.json")
    return None


def execute_discover_supported_obis(request: DiscoverSupportedObisRequest) -> RuntimeResponseEnvelope:
    settings = get_settings()
    adapter = get_runtime_adapter()
    log.info(
        "discover_supported_obis",
        extra={
            "meter_id": request.meterId,
            "channel_type": request.channel.type if request.channel else None,
        },
    )
    envelope = adapter.discover_supported_obis(request)

    if (
        envelope.ok
        and not envelope.simulated
        and envelope.payload is not None
        and isinstance(envelope.payload, DiscoverSupportedObisPayload)
        and settings.discovery_snapshot_autosave
    ):
        try:
            cap = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            fp = compute_profile_fingerprint(
                adapter=settings.adapter,
                discovery_association_ln=settings.discovery_association_ln,
                mvp_ami_config_path=_resolved_config_path_for_fingerprint(),
                mvp_ami_root=(settings.mvp_ami_root or "").strip() or None,
            )
            record = build_record_from_discovery(
                request=request,
                payload=envelope.payload,
                captured_at_utc=cap,
                profile_fingerprint=fp,
                simulated=envelope.simulated,
                runtime_adapter=settings.adapter,
                discovery_finished_at=envelope.finishedAt,
            )
            base = resolve_snapshot_dir(settings.discovery_snapshot_dir or "")
            save_snapshot(base, record, settings.discovery_snapshot_max_history)
        except Exception as exc:  # noqa: BLE001
            log.warning("discovery_snapshot_autosave_failed", extra={"error": str(exc)})

    return envelope
