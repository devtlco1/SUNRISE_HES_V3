"""
Strict inbound TCP resolution: actions use only the socket bound to the selected canonical serial.

meterId on requests is the target meter serial (same as registry / 0.0.96.1.0.255).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from app.adapters.mvp_ami_adapter import MvpAmiRuntimeAdapter
from app.schemas.envelope import (
    RuntimeErrorInfo,
    RuntimeExecutionDiagnostics,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import ReadIdentityRequest
from app.tcp_listener.inbound_target_serial import normalize_inbound_target_serial
from app.tcp_listener.staged_modem_listener import StagedSocketHold, TcpModemListenerController

log = logging.getLogger(__name__)


def _iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


@dataclass
class AcquiredInboundSocket:
    hold: StagedSocketHold
    endpoint: str
    """If set, identity was just read on this socket to prove canonical serial (skip redundant preflight)."""
    identity_just_verified: bool = False
    cached_identity_envelope: Optional[RuntimeResponseEnvelope] = None


def acquire_inbound_socket_for_target_meter(
    ctl: TcpModemListenerController,
    adapter: MvpAmiRuntimeAdapter,
    target_serial: str,
) -> tuple[Optional[AcquiredInboundSocket], str]:
    """
    Resolve socket for inbound action.

    Order: (1) pop bound session for target serial (2) if exactly one unbound, read identity and require match.

    Returns (None, error_code) on failure. error_code is a stable token for messages.
    """
    ts = normalize_inbound_target_serial(target_serial)
    if not ts:
        return None, "EMPTY_TARGET_METER_SERIAL"

    hold = ctl.pop_bound_session(ts)
    if hold is not None:
        ep = f"{hold.meta.remote_host}:{hold.meta.remote_port}"
        return AcquiredInboundSocket(hold=hold, endpoint=ep, identity_just_verified=False), ""

    un = ctl.unbound_queue_len()
    if un == 0:
        return None, "NO_STAGED_SESSION_FOR_SELECTED_METER"
    if un > 1:
        return None, "MULTIPLE_INBOUND_MODEMS_USE_SCANNER_FIRST"

    hold = ctl.pop_unbound_left()
    if hold is None:
        return None, "NO_STAGED_SESSION_FOR_SELECTED_METER"
    ep = f"{hold.meta.remote_host}:{hold.meta.remote_port}"
    req = ReadIdentityRequest(meterId=ts)
    try:
        env = adapter.read_identity_on_accepted_tcp_socket(req, hold.sock, ep)
    except Exception as exc:  # noqa: BLE001
        log.exception("inbound_acquire_identity_verify_failed")
        ctl.close_hold(hold, reason="identity_verify_exception")
        return None, "INBOUND_IDENTITY_VERIFY_EXCEPTION"

    if not env.ok or env.payload is None:
        ctl.close_hold(hold, reason="identity_verify_failed")
        return None, "INBOUND_IDENTITY_VERIFY_FAILED"

    wire = normalize_inbound_target_serial(env.payload.serialNumber)
    if wire != ts:
        ctl.close_hold(hold, reason="inbound_serial_mismatch")
        log.warning(
            "inbound_serial_mismatch",
            extra={"expected": ts, "wire": wire, "remote": ep},
        )
        return None, "INBOUND_IDENTITY_SERIAL_MISMATCH"

    return (
        AcquiredInboundSocket(
            hold=hold,
            endpoint=ep,
            identity_just_verified=True,
            cached_identity_envelope=env,
        ),
        "",
    )


def preflight_tcp_inbound_canonical_serial(
    adapter: MvpAmiRuntimeAdapter,
    hold: StagedSocketHold,
    endpoint: str,
    expected_serial: str,
    *,
    started: datetime,
    meter_id_for_envelope: str,
) -> Optional[RuntimeResponseEnvelope]:
    """
    Re-read identity on socket before state-changing relay. Returns failure envelope if mismatch or read fails.
    """
    ts = normalize_inbound_target_serial(expected_serial)
    req = ReadIdentityRequest(meterId=meter_id_for_envelope)
    try:
        env = adapter.read_identity_on_accepted_tcp_socket(req, hold.sock, endpoint)
    except Exception as exc:  # noqa: BLE001
        log.exception("inbound_preflight_identity_failed")
        finished = datetime.now(timezone.utc)
        return RuntimeResponseEnvelope(
            ok=False,
            simulated=False,
            operation="readIdentity",
            meterId=meter_id_for_envelope,
            startedAt=_iso_z(started),
            finishedAt=_iso_z(finished),
            durationMs=max(1, int((finished - started).total_seconds() * 1000)),
            message=f"Pre-flight identity failed before relay action: {exc}",
            transportState="disconnected",
            associationState="none",
            payload=None,
            error=RuntimeErrorInfo(
                code="INBOUND_PREFLIGHT_IDENTITY_EXCEPTION",
                message=str(exc)[:400],
                details={"targetMeterSerial": ts, "transportMode": "tcp_inbound"},
            ),
            diagnostics=RuntimeExecutionDiagnostics(
                outcome="attempted_failed",
                capabilityStage="relay_control",
                transportAttempted=True,
                associationAttempted=False,
                verifiedOnWire=False,
                detailCode="INBOUND_PREFLIGHT_IDENTITY_EXCEPTION",
            ),
        )

    if not env.ok or env.payload is None:
        return env

    wire = normalize_inbound_target_serial(env.payload.serialNumber)
    if wire != ts:
        finished = datetime.now(timezone.utc)
        return RuntimeResponseEnvelope(
            ok=False,
            simulated=False,
            operation="readIdentity",
            meterId=meter_id_for_envelope,
            startedAt=_iso_z(started),
            finishedAt=_iso_z(finished),
            durationMs=max(1, int((finished - started).total_seconds() * 1000)),
            message=(
                f"Pre-flight: socket canonical serial {wire!r} does not match selected meter {ts!r} — refusing relay."
            ),
            transportState="disconnected",
            associationState="none",
            payload=None,
            error=RuntimeErrorInfo(
                code="INBOUND_PREFLIGHT_SERIAL_MISMATCH",
                message="Staged session does not match selected meter serial.",
                details={
                    "targetMeterSerial": ts,
                    "wireCanonicalSerial": wire,
                    "transportMode": "tcp_inbound",
                },
            ),
            diagnostics=RuntimeExecutionDiagnostics(
                outcome="attempted_failed",
                capabilityStage="relay_control",
                transportAttempted=True,
                associationAttempted=False,
                verifiedOnWire=False,
                detailCode="INBOUND_PREFLIGHT_SERIAL_MISMATCH",
            ),
        )
    return None


def error_message_for_acquire_code(code: str, *, target_serial: str) -> str:
    ts = target_serial.strip()
    if code == "EMPTY_TARGET_METER_SERIAL":
        return "Selected meter serial is empty — pick a meter."
    if code == "NO_STAGED_SESSION_FOR_SELECTED_METER":
        return f"No inbound session for selected meter {ts!r} — connect that modem or use Scanner to bind."
    if code == "MULTIPLE_INBOUND_MODEMS_USE_SCANNER_FIRST":
        return "Several modems are inbound — use Scanner (Identify) to bind each serial before actions."
    if code == "INBOUND_IDENTITY_VERIFY_FAILED":
        return f"Could not read canonical serial on inbound socket for {ts!r}."
    if code == "INBOUND_IDENTITY_VERIFY_EXCEPTION":
        return "Identity verify on inbound socket raised an error."
    if code == "INBOUND_IDENTITY_SERIAL_MISMATCH":
        return f"Inbound modem is not {ts!r} (0.0.96.1.0.255 mismatch) — select the correct meter or reconnect."
    return code
