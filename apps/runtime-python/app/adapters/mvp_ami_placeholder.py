"""
Placeholder for future MVP-AMI-backed adapter.

Does not import MVP-AMI in this step — returns an explicit not-implemented envelope.
"""

from datetime import datetime, timezone

from app.adapters.base import ProtocolRuntimeAdapter
from app.schemas.envelope import (
    RuntimeErrorInfo,
    RuntimeExecutionDiagnostics,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import ReadIdentityRequest


class MvpAmiRuntimeAdapter(ProtocolRuntimeAdapter):
    def read_identity(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        started = datetime.now(timezone.utc)
        finished = datetime.now(timezone.utc)
        duration_ms = int((finished - started).total_seconds() * 1000) or 1

        diagnostics = RuntimeExecutionDiagnostics(
            outcome="not_implemented",
            capabilityStage="cosem_read",
            transportAttempted=False,
            associationAttempted=False,
            verifiedOnWire=False,
            detailCode="MVP_AMI_ADAPTER_NOT_WIRED",
        )

        return RuntimeResponseEnvelope(
            ok=False,
            simulated=False,
            operation="readIdentity",
            meterId=request.meterId,
            startedAt=started.isoformat().replace("+00:00", "Z"),
            finishedAt=finished.isoformat().replace("+00:00", "Z"),
            durationMs=duration_ms,
            message=(
                "MVP-AMI adapter mode is selected but not wired in this build. "
                "Use SUNRISE_RUNTIME_ADAPTER=stub for synthetic responses, or implement "
                "MvpAmiRuntimeAdapter.read_identity with MVP-AMI client code."
            ),
            transportState="disconnected",
            associationState="none",
            payload=None,
            error=RuntimeErrorInfo(
                code="MVP_AMI_NOT_WIRED",
                message="Protocol runtime MVP-AMI integration is a future phase.",
            ),
            diagnostics=diagnostics,
        )
