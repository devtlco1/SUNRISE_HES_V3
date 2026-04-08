"""Return a normal failure envelope when a relay service hits an uncaught exception (avoid bare HTTP 500)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.schemas.envelope import (
    RuntimeErrorInfo,
    RuntimeExecutionDiagnostics,
    RuntimeOperation,
    RuntimeResponseEnvelope,
)

log = logging.getLogger(__name__)


def _iso_utc_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def envelope_for_relay_service_crash(
    *,
    operation: RuntimeOperation,
    meter_id: str,
    started: datetime,
    exc: BaseException,
    message_prefix: str = "Relay service error",
) -> RuntimeResponseEnvelope:
    finished = datetime.now(timezone.utc)
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    msg = f"{message_prefix}: {exc}"
    log.exception(
        "relay_service_unhandled_exception",
        extra={"operation": operation, "meter_id": meter_id},
    )
    return RuntimeResponseEnvelope(
        ok=False,
        simulated=False,
        operation=operation,
        meterId=meter_id,
        startedAt=_iso_utc_z(started),
        finishedAt=_iso_utc_z(finished),
        durationMs=duration_ms,
        message=msg,
        transportState="disconnected",
        associationState="none",
        payload=None,
        error=RuntimeErrorInfo(
            code="RELAY_SERVICE_CRASH",
            message=msg,
            details={
                "exceptionType": type(exc).__name__,
                "exception": str(exc)[:800],
            },
        ),
        diagnostics=RuntimeExecutionDiagnostics(
            outcome="attempted_failed",
            capabilityStage="relay_control",
            transportAttempted=False,
            associationAttempted=False,
            verifiedOnWire=False,
            detailCode="RELAY_SERVICE_CRASH",
        ),
    )
