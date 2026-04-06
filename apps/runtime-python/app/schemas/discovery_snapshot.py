"""Persisted discovery snapshot document (file-backed JSON on disk)."""

from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, Field

from app.schemas.envelope import DiscoveredObjectRow


class DiscoverySnapshotRecord(BaseModel):
    """
    Stable on-disk shape for association-view snapshots.
    Aligns with `DiscoverSupportedObisPayload` plus provenance fields.
    """

    schemaVersion: str = Field(default="1", description="Bump when breaking persisted shape.")
    meterId: str
    capturedAtUtc: str = Field(description="ISO-8601 UTC with Z suffix.")
    associationLogicalName: str
    totalCount: int
    objects: List[DiscoveredObjectRow]
    source: str
    """SHA-256 hex of MVP-AMI config bytes + adapter + association LN (or synthetic stub marker)."""
    profileFingerprint: str
    simulated: bool = Field(description="True if snapshot came from stub adapter — normally not autosaved.")
    runtimeAdapter: str = Field(description="e.g. stub | mvp_ami")
    channelContext: Optional[dict[str, Any]] = Field(
        default=None,
        description="Optional serial/TCP hints from the discovery request (e.g. channel.type, devicePath).",
    )
    discoveryFinishedAt: Optional[str] = Field(
        default=None,
        description="Envelope `finishedAt` from the discovery call when autosaved.",
    )


class DiscoverySnapshotListItem(BaseModel):
    capturedAtUtc: str
    storedAs: str


class DiscoverySnapshotListResponse(BaseModel):
    meterId: str
    snapshots: List[DiscoverySnapshotListItem]
