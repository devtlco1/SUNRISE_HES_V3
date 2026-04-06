"""Inbound staged TCP: relay status / OFF / ON (MVP-AMI only; closes staged socket)."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Callable, Optional

from app.adapters.factory import get_runtime_adapter
from app.adapters.mvp_ami_adapter import MvpAmiRuntimeAdapter
from app.config import get_settings
from app.schemas.envelope import (
    RuntimeErrorInfo,
    RuntimeExecutionDiagnostics,
    RuntimeOperation,
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


def _fail(
    request: ReadIdentityRequest,
    operation: RuntimeOperation,
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
        operation=operation,
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
            capabilityStage="relay_control",
            transportAttempted=code != "TCP_LISTENER_DISABLED",
            associationAttempted=False,
            verifiedOnWire=False,
            detailCode=code,
        ),
    )


def _run_tcp_listener_relay(
    request: ReadIdentityRequest,
    *,
    operation: RuntimeOperation,
    trigger_op: str,
    run_on_socket: Callable[[MvpAmiRuntimeAdapter, ReadIdentityRequest, object, str], RuntimeResponseEnvelope],
    log_event: str,
) -> RuntimeResponseEnvelope:
    settings = get_settings()
    started = datetime.now(timezone.utc)
    ctl = get_tcp_modem_listener()
    envelope: Optional[RuntimeResponseEnvelope] = None
    remote: Optional[str] = None
    teardown = "not_applicable"

    with ctl.session_context():
        try:
            if not settings.tcp_listener_enabled:
                teardown = "listener_disabled"
                envelope = _fail(
                    request,
                    operation,
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
                    operation,
                    started,
                    datetime.now(timezone.utc),
                    "Inbound TCP relay requires SUNRISE_RUNTIME_ADAPTER=mvp_ami.",
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
                    operation,
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
                log.info(log_event, extra={"meter_id": request.meterId, "remote": endpoint})
                envelope = run_on_socket(adapter, request, sock, endpoint)
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
                        operation=trigger_op,
                        remote_endpoint=remote,
                        envelope=envelope,
                        socket_teardown=teardown,
                    )
                )


def execute_tcp_listener_relay_read_status(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    return _run_tcp_listener_relay(
        request,
        operation="relayReadStatus",
        trigger_op="relayReadStatus",
        log_event="tcp_listener_relay_read_status_start",
        run_on_socket=lambda ad, req, sk, ep: ad.relay_read_status_on_accepted_tcp_socket(req, sk, ep),
    )


def execute_tcp_listener_relay_disconnect(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    return _run_tcp_listener_relay(
        request,
        operation="relayDisconnect",
        trigger_op="relayDisconnect",
        log_event="tcp_listener_relay_disconnect_start",
        run_on_socket=lambda ad, req, sk, ep: ad.relay_disconnect_on_accepted_tcp_socket(req, sk, ep),
    )


def execute_tcp_listener_relay_reconnect(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    return _run_tcp_listener_relay(
        request,
        operation="relayReconnect",
        trigger_op="relayReconnect",
        log_event="tcp_listener_relay_reconnect_start",
        run_on_socket=lambda ad, req, sk, ep: ad.relay_reconnect_on_accepted_tcp_socket(req, sk, ep),
    )
