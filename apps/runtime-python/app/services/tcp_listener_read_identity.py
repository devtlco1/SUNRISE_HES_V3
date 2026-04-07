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

                sock, endpoint, _meta = ctl.take_staged_socket_for_session()
                if sock is None:
                    teardown = "no_staged_socket"
                    finished = datetime.now(timezone.utc)
                    st = ctl.get_status_dict()
                    envelope = _fail(
                        request,
                        started,
                        finished,
                        "No staged inbound TCP socket — wait for modem to connect, then retry.",
                        "NO_STAGED_TCP_SOCKET",
                        {
                            "transportMode": "tcp_inbound",
                            "listenerListening": st.get("listening"),
                            "stagedPresent": st.get("stagedPresent"),
                            "lastBindError": st.get("lastBindError"),
                        },
                    )
                    return envelope

                remote = endpoint
                teardown = "server_closed_after_trigger"
                try:
                    log.info(
                        "tcp_listener_read_identity_start",
                        extra={"meter_id": request.meterId, "remote": endpoint},
                    )
                    envelope = adapter.read_identity_on_accepted_tcp_socket(request, sock, endpoint)
                    return envelope
                finally:
                    try:
                        sock.close()
                    except Exception:  # noqa: BLE001
                        pass
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
