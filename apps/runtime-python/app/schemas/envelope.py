"""
Runtime response contracts aligned with `types/runtime.ts` (RuntimeResponseEnvelope).

Field names and semantics mirror the TypeScript control-plane model.
"""

from typing import Any, List, Literal, Optional, Union

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
    "discoverSupportedObis",
    "relayDisconnect",
    "relayReconnect",
]
RuntimeCapabilityStage = Literal[
    "none",
    "configuration",
    "transport_probe",
    "dlms_association",
    "cosem_read",
    "object_discovery",
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


class BasicRegisterReading(BaseModel):
    """One OBIS row mapped for API consumers (aligned with `types/runtime.ts`)."""

    value: str
    unit: Optional[str] = None
    quality: Optional[str] = None
    error: Optional[str] = Field(
        default=None,
        description="MVP-AMI read error or missing value for this OBIS.",
    )


class BasicRegistersPayload(BaseModel):
    registers: dict[str, BasicRegisterReading]


class DiscoveredObjectRow(BaseModel):
    """One entry from the meter association object list (COSEM class + logical name)."""

    classId: int
    obis: str = ""
    version: int = 0
    classIdName: Optional[str] = None
    description: Optional[str] = None
    shortName: Optional[int] = None
    error: Optional[str] = Field(default=None, description="Normalization error only.")


class DiscoverSupportedObisPayload(BaseModel):
    """Association-view snapshot: objects the meter exposes in the current AA (not a global OBIS dictionary)."""

    associationLogicalName: str
    totalCount: int
    objects: List[DiscoveredObjectRow]
    source: str = Field(
        default="gurux_association_ln_object_list_attr2",
        description="How the catalog was obtained (Gurux GET on Association LN attribute 2).",
    )


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
    payload: Optional[Union[IdentityPayload, BasicRegistersPayload, DiscoverSupportedObisPayload]] = None
    error: Optional[RuntimeErrorInfo] = None
    diagnostics: Optional[RuntimeExecutionDiagnostics] = None
