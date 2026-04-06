"""Explicit stub: simulated identity, never claims on-wire proof."""

from datetime import datetime, timezone

from app.adapters.base import ProtocolRuntimeAdapter
from app.schemas.envelope import (
    IdentityPayload,
    RuntimeExecutionDiagnostics,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import ReadIdentityRequest


class StubRuntimeAdapter(ProtocolRuntimeAdapter):
    def read_identity(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        started = datetime.now(timezone.utc)
        finished = datetime.now(timezone.utc)
        duration_ms = int((finished - started).total_seconds() * 1000) or 1

        payload = IdentityPayload(
            serialNumber=f"STUB-{request.meterId[:32]}",
            manufacturer="SunriseRuntimeStub",
            model="python-sidecar-v0",
            firmwareVersion="0.0.0-stub",
            protocolVersion="DLMS/COSEM (not on wire)",
            logicalDeviceName=f"stub::{request.meterId}",
        )

        diagnostics = RuntimeExecutionDiagnostics(
            outcome="simulated_success",
            capabilityStage="cosem_read",
            transportAttempted=False,
            associationAttempted=False,
            verifiedOnWire=False,
            detailCode="PYTHON_STUB_READ_IDENTITY",
        )

        return RuntimeResponseEnvelope(
            ok=True,
            simulated=True,
            operation="readIdentity",
            meterId=request.meterId,
            startedAt=started.isoformat().replace("+00:00", "Z"),
            finishedAt=finished.isoformat().replace("+00:00", "Z"),
            durationMs=duration_ms,
            message=(
                "Python sidecar stub: identity fields are synthetic. "
                "No meter I/O was performed. Replace adapter with MVP-AMI-backed "
                "implementation for on-wire reads."
            ),
            transportState="disconnected",
            associationState="none",
            payload=payload,
            diagnostics=diagnostics,
        )
