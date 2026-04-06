"""Explicit stub: simulated identity, never claims on-wire proof."""

from datetime import datetime, timezone

from app.adapters.base import ProtocolRuntimeAdapter
from app.schemas.envelope import (
    BasicRegisterReading,
    BasicRegistersPayload,
    DiscoveredObjectRow,
    DiscoverSupportedObisPayload,
    IdentityPayload,
    RuntimeExecutionDiagnostics,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import (
    DiscoverSupportedObisRequest,
    ReadBasicRegistersRequest,
    ReadIdentityRequest,
)


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

    def read_basic_registers(self, request: ReadBasicRegistersRequest) -> RuntimeResponseEnvelope:
        started = datetime.now(timezone.utc)
        finished = datetime.now(timezone.utc)
        duration_ms = int((finished - started).total_seconds() * 1000) or 1

        registers = {
            "0.0.1.0.0.255": BasicRegisterReading(
                value="2026-01-01T12:00:00.000Z",
                quality="simulated",
            ),
            "1.0.1.8.0.255": BasicRegisterReading(
                value="12345.678",
                unit="kWh",
                quality="simulated",
            ),
            "1.0.32.7.0.255": BasicRegisterReading(
                value="230.0",
                unit="V",
                quality="simulated",
            ),
        }

        diagnostics = RuntimeExecutionDiagnostics(
            outcome="simulated_success",
            capabilityStage="cosem_read",
            transportAttempted=False,
            associationAttempted=False,
            verifiedOnWire=False,
            detailCode="PYTHON_STUB_READ_BASIC_REGISTERS",
        )

        return RuntimeResponseEnvelope(
            ok=True,
            simulated=True,
            operation="readBasicRegisters",
            meterId=request.meterId,
            startedAt=started.isoformat().replace("+00:00", "Z"),
            finishedAt=finished.isoformat().replace("+00:00", "Z"),
            durationMs=duration_ms,
            message=(
                "Python sidecar stub: basic registers are synthetic. "
                "No meter I/O was performed."
            ),
            transportState="disconnected",
            associationState="none",
            payload=BasicRegistersPayload(registers=registers),
            diagnostics=diagnostics,
        )

    def discover_supported_obis(self, request: DiscoverSupportedObisRequest) -> RuntimeResponseEnvelope:
        started = datetime.now(timezone.utc)
        finished = datetime.now(timezone.utc)
        duration_ms = int((finished - started).total_seconds() * 1000) or 1

        payload = DiscoverSupportedObisPayload(
            associationLogicalName="0.0.40.0.0.255",
            totalCount=2,
            objects=[
                DiscoveredObjectRow(
                    classId=1,
                    obis="0.0.0.0.0.255",
                    version=0,
                    classIdName="simulated",
                    description="stub only — not from meter",
                ),
                DiscoveredObjectRow(
                    classId=3,
                    obis="0.0.96.1.1.255",
                    version=0,
                    classIdName="simulated",
                ),
            ],
            source="python_stub_simulated",
        )

        diagnostics = RuntimeExecutionDiagnostics(
            outcome="simulated_success",
            capabilityStage="object_discovery",
            transportAttempted=False,
            associationAttempted=False,
            verifiedOnWire=False,
            detailCode="PYTHON_STUB_DISCOVER_SUPPORTED_OBIS",
        )

        return RuntimeResponseEnvelope(
            ok=True,
            simulated=True,
            operation="discoverSupportedObis",
            meterId=request.meterId,
            startedAt=started.isoformat().replace("+00:00", "Z"),
            finishedAt=finished.isoformat().replace("+00:00", "Z"),
            durationMs=duration_ms,
            message="Python sidecar stub: catalog is synthetic. No association view was read.",
            transportState="disconnected",
            associationState="none",
            payload=payload,
            diagnostics=diagnostics,
        )
