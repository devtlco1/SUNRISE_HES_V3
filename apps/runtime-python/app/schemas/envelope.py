"""
Runtime response contracts aligned with `types/runtime.ts` (RuntimeResponseEnvelope).

Field names and semantics mirror the TypeScript control-plane model.
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class RuntimeErrorInfo(BaseModel):
    code: str
    message: str
    details: Optional[dict[str, Any]] = None


TransportState = Literal["disconnected", "connecting", "connected", "degraded", "error"]
AssociationState = Literal["none", "associating", "associated", "failed"]
RuntimeOperation = Literal[
    "probeConnection",
    "associate",
    "readIdentity",
    "readClock",
    "readBasicRegisters",
    "relayDisconnect",
    "relayReconnect",
]
RuntimeCapabilityStage = Literal[
    "none",
    "configuration",
    "transport_probe",
    "dlms_association",
    "cosem_read",
    "relay_control",
]
RuntimeOperationOutcome = Literal[
    "not_attempted",
    "not_implemented",
    "attempted_failed",
    "simulated_success",
    "transport_reachable_unverified",
    "verified_on_wire_success",
]


class RuntimeExecutionDiagnostics(BaseModel):
    outcome: RuntimeOperationOutcome
    capabilityStage: RuntimeCapabilityStage
    transportAttempted: bool
    associationAttempted: bool
    verifiedOnWire: bool = Field(
        description="True only when DLMS/COSEM outcome is proven from wire bytes."
    )
    detailCode: Optional[str] = None


class IdentityPayload(BaseModel):
    serialNumber: str
    manufacturer: str
    model: str
    firmwareVersion: str
    protocolVersion: str
    logicalDeviceName: Optional[str] = None


class RuntimeResponseEnvelope(BaseModel):
    ok: bool
    simulated: bool
    operation: RuntimeOperation
    meterId: str
    startedAt: str
    finishedAt: str
    durationMs: int
    message: str
    transportState: TransportState
    associationState: AssociationState
    payload: Optional[IdentityPayload] = None
    error: Optional[RuntimeErrorInfo] = None
    diagnostics: Optional[RuntimeExecutionDiagnostics] = None
