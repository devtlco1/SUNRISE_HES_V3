"""Read persisted association-view discovery snapshots (file-backed JSON)."""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from app.catalog.discovery_snapshot_store import (
    list_snapshots,
    load_latest,
    resolve_snapshot_dir,
    sanitize_meter_id,
)
from app.config import Settings, get_settings
from app.routes.runtime_v1 import verify_service_token
from app.schemas.discovery_snapshot import DiscoverySnapshotListResponse, DiscoverySnapshotRecord

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/runtime/discovery-snapshots", tags=["discovery-snapshots"])


def _snapshot_base(settings: Settings) -> Path:
    return resolve_snapshot_dir(settings.discovery_snapshot_dir or "")


@router.get(
    "/{meter_id}/latest",
    response_model=DiscoverySnapshotRecord,
    dependencies=[Depends(verify_service_token)],
)
def get_discovery_snapshot_latest(meter_id: str) -> DiscoverySnapshotRecord:
    try:
        sanitize_meter_id(meter_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_METER_ID") from exc
    settings = get_settings()
    rec = load_latest(_snapshot_base(settings), meter_id)
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SNAPSHOT_NOT_FOUND")
    return rec


@router.get(
    "/{meter_id}",
    response_model=DiscoverySnapshotListResponse,
    dependencies=[Depends(verify_service_token)],
)
def list_discovery_snapshots(meter_id: str) -> DiscoverySnapshotListResponse:
    try:
        sanitize_meter_id(meter_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="INVALID_METER_ID") from exc
    settings = get_settings()
    items = list_snapshots(_snapshot_base(settings), meter_id)
    return DiscoverySnapshotListResponse(meterId=meter_id.strip(), snapshots=items)
