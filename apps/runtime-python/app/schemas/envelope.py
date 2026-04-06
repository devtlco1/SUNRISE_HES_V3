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
    "readObisSelection",
    "discoverSupportedObis",
    "relayReadStatus",
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


ObisSelectionRowStatus = Literal["ok", "error", "unsupported"]


class ObisSelectionRowResult(BaseModel):
    """One row in read-obis-selection response (operator table merge)."""

    obis: str
    value: str = ""
    unit: Optional[str] = None
    quality: Optional[str] = None
    error: Optional[str] = None
    status: ObisSelectionRowStatus = "ok"
    packKey: Optional[str] = None
    lastReadAt: Optional[str] = None
    resolvedResultFormat: Optional[str] = Field(
        default=None,
        description="e.g. scalar | clock — informational for UI.",
    )


class ReadObisSelectionPayload(BaseModel):
    rows: List[ObisSelectionRowResult]


RelayStateNormalized = Literal["on", "off", "unknown"]


class RelayControlPayload(BaseModel):
    """Disconnect-control / service switch posture (normalized for operator UI)."""

    relayState: RelayStateNormalized = "unknown"
    rawDisplay: Optional[str] = Field(
        default=None,
        description="Raw on-wire display string or repr from the last read/method when available.",
    )
    logicalName: Optional[str] = Field(
        default=None,
        description="COSEM logical name used (disconnect control LN by default).",
    )
    methodExecuted: Optional[int] = Field(
        default=None,
        description="When set, a COSEM method was invoked (e.g. 1=remote disconnect, 2=remote reconnect).",
    )


class DiscoveredObjectRow(BaseModel):
    """One entry from the meter association object list (COSEM class + logical name)."""

    classId: int
    obis: str = ""
    version: int = 0
    classIdName: Optional[str] = None
    description: Optional[str] = None
    shortName: Optional[int] = None
    error: Optional[str] = Field(default=None, description="Normalization error only.")


class AssociationViewInstrumentation(BaseModel):
    """
    Bounded raw evidence for Association LN object-list (attr 2) debugging.
    Populated on real mvp_ami discovery; omitted or minimal for stub.
    """

    guruxAssociationObjectPythonType: Optional[str] = Field(
        default=None,
        description="Type name of the Gurux association object used for the read.",
    )
    readAttributeIndex: int = Field(default=2, description="COSEM attribute index read (object list).")
    objectListSnapshots: List[dict[str, Any]] = Field(
        default_factory=list,
        description="pre_read / post_read summaries: pythonType, reprPreview (capped), lengthProbe.",
    )
    rawObjectListPythonType: Optional[str] = Field(
        default=None,
        description="Python type name of objectList after the read (post-read snapshot).",
    )
    rawObjectListTypeQualname: Optional[str] = None
    rawObjectListReprPreview: Optional[str] = Field(
        default=None,
        description="repr(objectList) capped — not a full wire dump.",
    )
    rawObjectListLengthProbe: Optional[dict[str, Any]] = Field(
        default=None,
        description="count/method/capped from bounded length probe on objectList after read.",
    )
    normalizationDecision: str = Field(
        default="unknown",
        description="input_none | not_iterable | normalized_ok | read_failed | stub_simulated",
    )
    normalizationInputCount: int = 0
    normalizationOutputCount: int = 0
    normalizationDroppedOrFailedCount: int = 0
    normalizationDropReasonsSample: List[dict[str, Any]] = Field(default_factory=list)
    associationViewDebugNote: str = Field(
        default="",
        description="Short human summary; use structured fields above for evidence.",
    )


class DiscoverSupportedObisPayload(BaseModel):
    """Association-view snapshot: objects the meter exposes in the current AA (not a global OBIS dictionary)."""

    associationLogicalName: str
    totalCount: int
    objects: List[DiscoveredObjectRow]
    source: str = Field(
        default="gurux_association_ln_object_list_attr2",
        description="How the catalog was obtained (Gurux GET on Association LN attribute 2).",
    )
    associationViewInstrumentation: Optional[AssociationViewInstrumentation] = Field(
        default=None,
        description="Raw Gurux/Python-side evidence for empty or unexpected object lists.",
    )
    catalogIntegrityNote: Optional[str] = Field(
        default=None,
        description="Honest note when objects[] is empty (e.g. raw list length zero vs parser issue).",
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
    payload: Optional[
        Union[
            IdentityPayload,
            BasicRegistersPayload,
            ReadObisSelectionPayload,
            DiscoverSupportedObisPayload,
            RelayControlPayload,
        ]
    ] = None
    error: Optional[RuntimeErrorInfo] = None
    diagnostics: Optional[RuntimeExecutionDiagnostics] = None
