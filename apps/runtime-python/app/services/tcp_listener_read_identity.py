"""Explicit read-identity on staged inbound modem TCP socket (MVP-AMI run_phase1_tcp_socket)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from app.adapters.factory import get_runtime_adapter
from app.adapters.mvp_ami_adapter import MvpAmiRuntimeAdapter
from app.config import get_settings
from app.schemas.envelope import (
    RuntimeErrorInfo,
    RuntimeExecutionDiagnostics,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import ReadIdentityRequest
from app.services.tcp_listener_socket_acquire import (
    acquire_inbound_socket_for_target_meter,
    error_message_for_acquire_code,
)
from app.tcp_listener.inbound_target_serial import (
    is_scanner_bind_meter_id,
    normalize_inbound_target_serial,
)
from app.tcp_listener.staged_modem_listener import (
    build_last_tcp_listener_trigger_record,
    get_tcp_modem_listener,
)

log = logging.getLogger(__name__)


def _iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def execute_tcp_listener_read_identity(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    settings = get_settings()
    started = datetime.now(timezone.utc)
    ctl = get_tcp_modem_listener()
    envelope: Optional[RuntimeResponseEnvelope] = None
    remote: Optional[str] = None
    teardown = "not_applicable"

    if not ctl.begin_inbound_operator_action():
        return _fail(
            request,
            started,
            datetime.now(timezone.utc),
            "Inbound modem action already in progress — wait for it to finish.",
            "SESSION_BUSY",
            {"transportMode": "tcp_inbound"},
        )

    try:
        with ctl.session_context():
            try:
                if not settings.tcp_listener_enabled:
                    teardown = "listener_disabled"
                    envelope = _fail(
                        request,
                        started,
                        datetime.now(timezone.utc),
                        "TCP modem listener is disabled (set SUNRISE_RUNTIME_TCP_LISTENER_ENABLED=true).",
                        "TCP_LISTENER_DISABLED",
                        {"transportMode": "tcp_inbound", "listenerEnabled": False},
                    )
                    return envelope

                adapter = get_runtime_adapter()
                if not isinstance(adapter, MvpAmiRuntimeAdapter):
                    teardown = "wrong_adapter"
                    envelope = _fail(
                        request,
                        started,
                        datetime.now(timezone.utc),
                        "Inbound TCP read-identity requires SUNRISE_RUNTIME_ADAPTER=mvp_ami.",
                        "TCP_LISTENER_REQUIRES_MVP_AMI",
                        {"transportMode": "tcp_inbound", "adapter": settings.adapter},
                    )
                    return envelope

                if is_scanner_bind_meter_id(request.meterId):
                    hold = ctl.pop_first_routable_unbound()
                    if hold is None:
                        teardown = "no_routable_unbound_socket"
                        finished = datetime.now(timezone.utc)
                        st = ctl.get_status_dict()
                        awaiting = int(st.get("awaitingAutoIdentifyCount") or 0)
                        msg = (
                            "No session needs manual bind — auto-identify is running; retry shortly."
                            if awaiting > 0
                            else "No inbound modem needs Scanner recovery (auto-identify handles new connections)."
                        )
                        envelope = _fail(
                            request,
                            started,
                            finished,
                            msg,
                            "NO_ROUTABLE_UNBOUND_INBOUND_SOCKET",
                            {
                                "transportMode": "tcp_inbound",
                                "listenerListening": st.get("listening"),
                                "unboundInboundCount": st.get("unboundInboundCount"),
                                "awaitingAutoIdentifyCount": st.get("awaitingAutoIdentifyCount"),
                                "routableUnboundCount": st.get("routableUnboundCount"),
                                "lastBindError": st.get("lastBindError"),
                            },
                        )
                        return envelope
                    remote = f"{hold.meta.remote_host}:{hold.meta.remote_port}"
                    teardown = "socket_kept_bound_after_scanner_identity"
                    try:
                        log.info(
                            "tcp_listener_read_identity_scanner_bind",
                            extra={"remote": remote},
                        )
                        envelope = adapter.read_identity_on_accepted_tcp_socket(
                            request, hold.sock, remote
                        )
                        if (
                            envelope.ok
                            and envelope.payload is not None
                            and normalize_inbound_target_serial(envelope.payload.serialNumber)
                        ):
                            ctl.register_bound_session(
                                envelope.payload.serialNumber,
                                hold,
                                binding_source="manual",
                            )
                        else:
                            teardown = "server_closed_after_failed_scanner_identity"
                            ctl.close_hold(hold, reason="scanner_identity_failed")
                        return envelope
                    except Exception:
                        teardown = "server_closed_after_scanner_identity_exception"
                        ctl.close_hold(hold, reason="scanner_identity_exception")
                        raise
                else:
                    ts = normalize_inbound_target_serial(request.meterId)
                    acq, code = acquire_inbound_socket_for_target_meter(ctl, adapter, ts)
                    if acq is None:
                        teardown = "acquire_failed"
                        finished = datetime.now(timezone.utc)
                        st = ctl.get_status_dict()
                        envelope = _fail(
                            request,
                            started,
                            finished,
                            error_message_for_acquire_code(code, target_serial=ts),
                            code,
                            {
                                "transportMode": "tcp_inbound",
                                "targetMeterSerial": ts,
                                "listenerListening": st.get("listening"),
                                "unboundInboundCount": st.get("unboundInboundCount"),
                                "awaitingAutoIdentifyCount": st.get("awaitingAutoIdentifyCount"),
                                "routableUnboundCount": st.get("routableUnboundCount"),
                                "boundInboundCount": st.get("boundInboundCount"),
                                "lastBindError": st.get("lastBindError"),
                            },
                        )
                        return envelope

                    remote = acq.endpoint
                    teardown = "socket_kept_bound_after_identity"
                    try:
                        if acq.cached_identity_envelope is not None:
                            envelope = acq.cached_identity_envelope
                            canon = normalize_inbound_target_serial(
                                envelope.payload.serialNumber  # type: ignore[union-attr]
                            )
                            if canon == ts:
                                ctl.register_bound_session(
                                    canon, acq.hold, binding_source="manual"
                                )
                            else:
                                ctl.close_hold(acq.hold, reason="cached_identity_serial_mismatch")
                            return envelope

                        log.info(
                            "tcp_listener_read_identity_start",
                            extra={"meter_id": request.meterId, "remote": remote},
                        )
                        envelope = adapter.read_identity_on_accepted_tcp_socket(
                            request, acq.hold.sock, remote
                        )
                        if (
                            envelope.ok
                            and envelope.payload is not None
                            and normalize_inbound_target_serial(envelope.payload.serialNumber)
                            == ts
                        ):
                            ctl.register_bound_session(
                                ts, acq.hold, binding_source="manual"
                            )
                        elif envelope.ok and envelope.payload is not None:
                            ctl.close_hold(acq.hold, reason="identity_serial_mismatch_vs_target")
                            envelope = _fail(
                                request,
                                started,
                                datetime.now(timezone.utc),
                                error_message_for_acquire_code(
                                    "INBOUND_IDENTITY_SERIAL_MISMATCH", target_serial=ts
                                ),
                                "INBOUND_IDENTITY_SERIAL_MISMATCH",
                                {
                                    "transportMode": "tcp_inbound",
                                    "targetMeterSerial": ts,
                                    "wireCanonicalSerial": normalize_inbound_target_serial(
                                        envelope.payload.serialNumber
                                    ),
                                },
                            )
                        else:
                            ctl.close_hold(acq.hold, reason="read_identity_failed")
                        return envelope
                    except Exception:
                        ctl.close_hold(acq.hold, reason="read_identity_exception")
                        raise
            finally:
                if envelope is not None:
                    ctl.record_tcp_listener_trigger(
                        build_last_tcp_listener_trigger_record(
                            operation="readIdentity",
                            remote_endpoint=remote,
                            envelope=envelope,
                            socket_teardown=teardown,
                        )
                    )
    finally:
        ctl.end_inbound_operator_action()


def _fail(
    request: ReadIdentityRequest,
    started: datetime,
    finished: datetime,
    message: str,
    code: str,
    err_extras: dict,
) -> RuntimeResponseEnvelope:
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    return RuntimeResponseEnvelope(
        ok=False,
        simulated=False,
        operation="readIdentity",
        meterId=request.meterId,
        startedAt=_iso_z(started),
        finishedAt=_iso_z(finished),
        durationMs=duration_ms,
        message=message,
        transportState="disconnected",
        associationState="none",
        payload=None,
        error=RuntimeErrorInfo(code=code, message=message, details=err_extras),
        diagnostics=RuntimeExecutionDiagnostics(
            outcome="attempted_failed",
            capabilityStage="transport_probe",
            transportAttempted=code != "TCP_LISTENER_DISABLED",
            associationAttempted=False,
            verifiedOnWire=False,
            detailCode=code,
        ),
    )
