"""
Relay (disconnect control) via MVP-AMI MeterClient: status = run_phase1 GET;
OFF/ON = Gurux COSEM methods 1/2 on GXDLMSDisconnectControl after association.
"""

from __future__ import annotations

import logging
import socket
import time
from datetime import datetime, timezone
from typing import Any, Optional, Tuple

from app.adapters.mvp_ami_shared import (
    MvpAmiBootstrapFailure,
    channel_spec_is_tcp,
    mvp_ami_bootstrap,
)
from app.config import Settings, get_settings
from app.schemas.envelope import (
    RelayControlPayload,
    RuntimeErrorInfo,
    RuntimeExecutionDiagnostics,
    RuntimeOperation,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import ReadIdentityRequest

log = logging.getLogger(__name__)


def _iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _association_state_on_failure(
    association_attempted: bool,
    association_succeeded: bool,
) -> str:
    """DLMS association reached; method/read failed afterward => still 'associated'."""
    if association_succeeded:
        return "associated"
    if association_attempted:
        return "failed"
    return "none"


def _classify_relay_cosem_method_detail(detail: Optional[str]) -> tuple[str, str]:
    """
    Classify Gurux disconnect-control method failure.
    Returns (error_code, concise_detail_for_message).
    """
    d = (detail or "").strip()
    if d.startswith("setup:"):
        return "RELAY_METHOD_SETUP_FAILED", d[6:].strip() or "(no detail)"
    if d == "method_no_packets":
        return "RELAY_METHOD_SETUP_FAILED", "no request packets from Gurux"
    if d == "method_deadline":
        return "RELAY_METHOD_INVOKE_FAILED", "response deadline exceeded"
    if d.startswith("dlms_error_"):
        return "RELAY_METHOD_INVOKE_FAILED", d
    return "RELAY_METHOD_FAILED", d or "unknown"


def _relay_fail(
    *,
    meter_id: str,
    operation: RuntimeOperation,
    started: datetime,
    finished: datetime,
    message: str,
    code: str,
    details: Optional[dict] = None,
    transport_attempted: bool = False,
    association_attempted: bool = False,
    association_succeeded: bool = False,
    verified: bool = False,
) -> RuntimeResponseEnvelope:
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    return RuntimeResponseEnvelope(
        ok=False,
        simulated=False,
        operation=operation,
        meterId=meter_id,
        startedAt=_iso_z(started),
        finishedAt=_iso_z(finished),
        durationMs=duration_ms,
        message=message,
        transportState="disconnected",
        associationState=_association_state_on_failure(association_attempted, association_succeeded),  # type: ignore[arg-type]
        payload=None,
        error=RuntimeErrorInfo(code=code, message=message, details=details),
        diagnostics=RuntimeExecutionDiagnostics(
            outcome="attempted_failed",
            capabilityStage="relay_control",
            transportAttempted=transport_attempted,
            associationAttempted=association_attempted,
            verifiedOnWire=verified,
            detailCode=code,
        ),
    )


def _relay_ok(
    *,
    meter_id: str,
    operation: RuntimeOperation,
    started: datetime,
    finished: datetime,
    message: str,
    payload: RelayControlPayload,
    transport_attempted: bool,
    association_attempted: bool,
    verified: bool,
    detail_code: str,
    simulated: bool = False,
) -> RuntimeResponseEnvelope:
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    out = "verified_on_wire_success" if verified else "attempted_failed"
    return RuntimeResponseEnvelope(
        ok=True,
        simulated=simulated,
        operation=operation,
        meterId=meter_id,
        startedAt=_iso_z(started),
        finishedAt=_iso_z(finished),
        durationMs=duration_ms,
        message=message,
        transportState="disconnected",
        associationState="associated" if association_attempted else "none",
        payload=payload,
        error=None,
        diagnostics=RuntimeExecutionDiagnostics(
            outcome=out,  # type: ignore[arg-type]
            capabilityStage="relay_control",
            transportAttempted=transport_attempted,
            associationAttempted=association_attempted,
            verifiedOnWire=verified,
            detailCode=detail_code,
        ),
    )


def _parse_relay_state_from_row(row: dict) -> str:
    """Normalize to on | off | unknown (IEC disconnect-control output_state is meter-specific)."""
    if row.get("error"):
        return "unknown"
    v = row.get("value")
    vs = str(row.get("value_str") or "").strip().lower()
    # Blue book style: 1=disconnected, 2=connected (internal supply).
    if isinstance(v, (int, float)):
        vi = int(v)
        if vi == 2:
            return "on"
        if vi == 1:
            return "off"
        if vi == 0:
            return "unknown"
    if "disconnect" in vs or vs in ("off", "open"):
        return "off"
    if "connect" in vs or vs in ("on", "closed", "close"):
        return "on"
    if vs in ("1", "2", "0"):
        return _parse_relay_state_from_row({"value": int(vs), "value_str": "", "error": None})
    return "unknown"


def _state_and_raw_from_meter_result(result: Any, ln: str) -> Tuple[str, str]:
    pv = getattr(result, "parsed_values", None) or {}
    row = pv.get(ln) if isinstance(pv, dict) else None
    if not isinstance(row, dict):
        return "unknown", ""
    st = _parse_relay_state_from_row(row)
    raw = str(row.get("value_str") or row.get("value") or "").strip()
    return st, raw


def _disconnect_control_method_packets(gx: Any, dc: Any, method_index: int) -> Any:
    """
    Gurux disconnect-control methods must use the official helpers: they call
    GXDLMSClient.method(item, index, data, type_) with (INT8, 0), not a hand-built
    GXDLMSLNParameters (whose constructor is version-specific: settings + status byte).
    """
    if method_index == 1:
        return dc.remoteDisconnect(gx)
    if method_index == 2:
        return dc.remoteReconnect(gx)
    raise ValueError(f"disconnect_control supports methods 1..2, got {method_index}")


def _gurux_invoke_disconnect_control_method(
    mc: Any,
    transport: Any,
    gx: Any,
    dc: Any,
    method_index: int,
) -> Tuple[bool, Optional[str]]:
    from gurux_dlms.GXByteBuffer import GXByteBuffer
    from gurux_dlms.GXReplyData import GXReplyData

    try:
        packets = _disconnect_control_method_packets(gx, dc, method_index)
    except Exception as exc:  # noqa: BLE001
        log.warning("relay_disconnect_control_method_packets_failed", extra={"error": str(exc)})
        return False, f"setup:{exc}"

    if packets is None:
        return False, "method_no_packets"

    read_buff = GXByteBuffer()
    reply = GXReplyData()
    to_send = list(packets) if not isinstance(packets, (list, tuple)) else packets
    for pkt in to_send:
        read_buff.clear()
        reply.clear()
        transport.write(bytes(pkt))
        transport.flush()
        deadline = time.monotonic() + max(
            15.0,
            float(mc.config.vendor.dlms_read_timeout_seconds) * 4.0,
        )
        while not reply.isComplete():
            if time.monotonic() > deadline:
                return False, "method_deadline"
            chunk = transport.read(4096)
            if chunk:
                read_buff.set(chunk)
                gx.getData(read_buff, reply, None)
            else:
                time.sleep(0.05)
        try:
            errn = int(reply.error) if reply.error is not None else 0
        except Exception:  # noqa: BLE001
            errn = 0
        if errn != 0:
            try:
                err_desc = str(reply.getError())
            except Exception:  # noqa: BLE001
                err_desc = str(errn)
            return False, f"dlms_error_{errn}:{err_desc}"
    return True, None


def _tcp_assoc(mc: Any, sock: socket.socket) -> Tuple[Any, Any, Optional[str]]:
    from meter_client import SocketSerialAdapter  # noqa: WPS433 — MVP-AMI on sys.path

    transport = SocketSerialAdapter(sock, close_underlying=False)
    transport.timeout = float(mc.config.vendor.iec_serial_timeout_seconds)
    probe_ok, _, _ = mc._run_iec_handshake_tcp(transport, cancel_event=None)
    if not probe_ok:
        return transport, None, "iec_handshake_failed"
    time.sleep(mc.config.vendor.after_iec_sleep_ms / 1000.0)
    transport.timeout = float(mc.config.vendor.dlms_read_timeout_seconds)
    mc._gurux_client = None
    if mc.config.vendor.use_broadcast_snrm_first:
        assoc_ok, _, _, gx = mc._attempt_vendor_broadcast_association(transport)
        mc._gurux_client = gx
    else:
        assoc_ok, _, _ = mc._attempt_gurux_association(transport)
        gx = mc._gurux_client
    if not assoc_ok or gx is None:
        return transport, gx, "association_failed"
    return transport, gx, None


def _serial_assoc(mc: Any) -> Tuple[Any, Any, Optional[str], Optional[str]]:
    import serial  # noqa: WPS433

    detected_ser, port_used = mc.open_serial()
    detected_ser.close()
    ok, _, _ = mc._run_iec_handshake(port_used, cancel_event=None)
    if not ok:
        return None, None, None, "iec_handshake_failed"
    time.sleep(mc.config.vendor.after_iec_sleep_ms / 1000.0)
    ser = serial.Serial(port_used, **mc._serial_params(mc.config.serial.dlms_baud, iec_mode=False))
    ser.timeout = float(mc.config.vendor.dlms_read_timeout_seconds)
    mc._gurux_client = None
    if mc.config.vendor.use_broadcast_snrm_first:
        assoc_ok, _, _, gx = mc._attempt_vendor_broadcast_association(ser)
        mc._gurux_client = gx
    else:
        assoc_ok, _, _ = mc._attempt_gurux_association(ser)
        gx = mc._gurux_client
    if not assoc_ok or gx is None:
        try:
            ser.close()
        except Exception:  # noqa: BLE001
            pass
        return None, None, None, "association_failed"
    return ser, gx, port_used, None


def _disconnect_control_object(ln: str) -> Any:
    from gurux_dlms.objects.GXDLMSDisconnectControl import GXDLMSDisconnectControl

    return GXDLMSDisconnectControl(ln)


def _bootstrap(settings: Settings, request: ReadIdentityRequest) -> Any:
    return mvp_ami_bootstrap(settings, request.channel)


def relay_read_status(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    settings = get_settings()
    started = datetime.now(timezone.utc)
    boot = _bootstrap(settings, request)
    if isinstance(boot, MvpAmiBootstrapFailure):
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation="relayReadStatus",
            started=started,
            finished=finished,
            message=boot.message,
            code=boot.code,
            details=boot.details,
        )

    ln = (settings.relay_disconnect_control_ln or "0.0.96.3.10.255").strip()
    mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
    mc_logger.setLevel(settings.log_level.upper())
    try:
        client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
    except Exception as exc:  # noqa: BLE001
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation="relayReadStatus",
            started=started,
            finished=finished,
            message=f"MVP-AMI MeterClient construct failed: {exc}",
            code="MVP_AMI_RUNTIME_ERROR",
            details={"error": str(exc)},
        )

    if channel_spec_is_tcp(request.channel):
        ch = request.channel
        assert ch is not None
        host = (ch.host or "").strip()
        port = ch.port
        if not host or port is None or int(port) <= 0 or int(port) > 65535:
            finished = datetime.now(timezone.utc)
            return _relay_fail(
                meter_id=request.meterId,
                operation="relayReadStatus",
                started=started,
                finished=finished,
                message="TCP client channel requires channel.host and channel.port (1-65535).",
                code="CHANNEL_TCP_INVALID",
                details={"host": host or None, "port": port},
            )
        timeout = float(
            ch.connectTimeoutSeconds
            if ch.connectTimeoutSeconds is not None
            else settings.tcp_client_connect_timeout_seconds
        )
        endpoint = f"{host}:{int(port)}"
        run_tcp = getattr(client, "run_phase1_tcp_socket", None)
        if run_tcp is None:
            finished = datetime.now(timezone.utc)
            return _relay_fail(
                meter_id=request.meterId,
                operation="relayReadStatus",
                started=started,
                finished=finished,
                message="MVP-AMI MeterClient has no run_phase1_tcp_socket.",
                code="MVP_AMI_TCP_SOCKET_API_MISSING",
                details={"mvpAmiRoot": boot.root},
            )
        sock: Optional[socket.socket] = None
        try:
            sock = socket.create_connection((host, int(port)), timeout=timeout)
            result = run_tcp(sock, obis_list=[ln])
        except Exception as exc:  # noqa: BLE001
            finished = datetime.now(timezone.utc)
            return _relay_fail(
                meter_id=request.meterId,
                operation="relayReadStatus",
                started=started,
                finished=finished,
                message=f"Relay status TCP failed: {exc}",
                code="RELAY_STATUS_TCP_ERROR",
                details={"tcpEndpoint": endpoint, "error": str(exc)},
                transport_attempted=True,
            )
        finally:
            if sock is not None:
                try:
                    sock.close()
                except Exception:  # noqa: BLE001
                    pass
    else:
        try:
            result = client.run_phase1(obis_list=[ln])
        except Exception as exc:  # noqa: BLE001
            finished = datetime.now(timezone.utc)
            return _relay_fail(
                meter_id=request.meterId,
                operation="relayReadStatus",
                started=started,
                finished=finished,
                message=f"Relay status serial failed: {exc}",
                code="RELAY_STATUS_SERIAL_ERROR",
                details={"error": str(exc)},
                transport_attempted=True,
            )

    finished = datetime.now(timezone.utc)
    st, raw = _state_and_raw_from_meter_result(result, ln)
    ok_wire = bool(getattr(result, "success", False)) and st != "unknown"
    payload = RelayControlPayload(
        relayState=st,  # type: ignore[arg-type]
        rawDisplay=raw or None,
        logicalName=ln,
    )
    return _relay_ok(
        meter_id=request.meterId,
        operation="relayReadStatus",
        started=started,
        finished=finished,
        message=f"Disconnect-control read {ln!r} (normalized={st!r}).",
        payload=payload,
        transport_attempted=True,
        association_attempted=True,
        verified=ok_wire,
        detail_code="RELAY_STATUS_OK" if ok_wire else "RELAY_STATUS_UNVERIFIED",
    )


def relay_read_status_inbound(
    request: ReadIdentityRequest,
    sock: socket.socket,
    remote_endpoint: str,
) -> RuntimeResponseEnvelope:
    settings = get_settings()
    started = datetime.now(timezone.utc)
    boot = mvp_ami_bootstrap(settings, None)
    if isinstance(boot, MvpAmiBootstrapFailure):
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation="relayReadStatus",
            started=started,
            finished=finished,
            message=boot.message,
            code=boot.code,
            details={**(boot.details or {}), "transportMode": "tcp_inbound"},
        )

    ln = (settings.relay_disconnect_control_ln or "0.0.96.3.10.255").strip()
    mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
    mc_logger.setLevel(settings.log_level.upper())
    try:
        client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
    except Exception as exc:  # noqa: BLE001
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation="relayReadStatus",
            started=started,
            finished=finished,
            message=f"MVP-AMI MeterClient construct failed: {exc}",
            code="MVP_AMI_RUNTIME_ERROR",
            details={"error": str(exc), "transportMode": "tcp_inbound"},
        )

    run_tcp = getattr(client, "run_phase1_tcp_socket", None)
    if run_tcp is None:
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation="relayReadStatus",
            started=started,
            finished=finished,
            message="MVP-AMI MeterClient has no run_phase1_tcp_socket.",
            code="MVP_AMI_TCP_SOCKET_API_MISSING",
            details={"transportMode": "tcp_inbound", "mvpAmiRoot": boot.root},
        )

    try:
        result = run_tcp(sock, obis_list=[ln])
    except Exception as exc:  # noqa: BLE001
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation="relayReadStatus",
            started=started,
            finished=finished,
            message=f"Inbound relay status failed: {exc}",
            code="RELAY_STATUS_INBOUND_ERROR",
            details={"error": str(exc), "tcpEndpoint": remote_endpoint, "transportMode": "tcp_inbound"},
            transport_attempted=True,
        )

    finished = datetime.now(timezone.utc)
    st, raw = _state_and_raw_from_meter_result(result, ln)
    ok_wire = bool(getattr(result, "success", False)) and st != "unknown"
    payload = RelayControlPayload(
        relayState=st,  # type: ignore[arg-type]
        rawDisplay=raw or None,
        logicalName=ln,
    )
    return _relay_ok(
        meter_id=request.meterId,
        operation="relayReadStatus",
        started=started,
        finished=finished,
        message=f"Inbound disconnect-control read {ln!r} ({remote_endpoint}).",
        payload=payload,
        transport_attempted=True,
        association_attempted=True,
        verified=ok_wire,
        detail_code="RELAY_STATUS_INBOUND_OK" if ok_wire else "RELAY_STATUS_INBOUND_UNVERIFIED",
    )


def _relay_method_direct(
    request: ReadIdentityRequest,
    operation: RuntimeOperation,
    method_index: int,
    expected_state: str,
) -> RuntimeResponseEnvelope:
    settings = get_settings()
    started = datetime.now(timezone.utc)
    boot = _bootstrap(settings, request)
    if isinstance(boot, MvpAmiBootstrapFailure):
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation=operation,
            started=started,
            finished=finished,
            message=boot.message,
            code=boot.code,
            details=boot.details,
        )

    ln = (settings.relay_disconnect_control_ln or "0.0.96.3.10.255").strip()
    mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
    mc_logger.setLevel(settings.log_level.upper())
    try:
        dc_obj = _disconnect_control_object(ln)
    except Exception as exc:  # noqa: BLE001
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation=operation,
            started=started,
            finished=finished,
            message=f"Gurux disconnect-control class unavailable: {exc}",
            code="RELAY_GURUX_CLASS_MISSING",
            details={"error": str(exc)},
        )

    try:
        client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
    except Exception as exc:  # noqa: BLE001
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation=operation,
            started=started,
            finished=finished,
            message=f"MVP-AMI MeterClient construct failed: {exc}",
            code="MVP_AMI_RUNTIME_ERROR",
            details={"error": str(exc)},
        )

    transport: Any = None
    gx: Any = None
    sock: Optional[socket.socket] = None

    try:
        if channel_spec_is_tcp(request.channel):
            ch = request.channel
            assert ch is not None
            host = (ch.host or "").strip()
            port = ch.port
            if not host or port is None or int(port) <= 0 or int(port) > 65535:
                finished = datetime.now(timezone.utc)
                return _relay_fail(
                    meter_id=request.meterId,
                    operation=operation,
                    started=started,
                    finished=finished,
                    message="TCP client channel requires channel.host and channel.port (1-65535).",
                    code="CHANNEL_TCP_INVALID",
                    details={"host": host or None, "port": port},
                )
            timeout = float(
                ch.connectTimeoutSeconds
                if ch.connectTimeoutSeconds is not None
                else settings.tcp_client_connect_timeout_seconds
            )
            endpoint = f"{host}:{int(port)}"
            try:
                sock = socket.create_connection((host, int(port)), timeout=timeout)
            except Exception as exc:  # noqa: BLE001
                finished = datetime.now(timezone.utc)
                return _relay_fail(
                    meter_id=request.meterId,
                    operation=operation,
                    started=started,
                    finished=finished,
                    message=f"TCP connect failed: {exc}",
                    code="TCP_CONNECT_FAILED",
                    details={"tcpEndpoint": endpoint, "error": str(exc)},
                    transport_attempted=True,
                )
            terr, gx, errc = _tcp_assoc(client, sock)
            transport = terr
            if errc:
                finished = datetime.now(timezone.utc)
                return _relay_fail(
                    meter_id=request.meterId,
                    operation=operation,
                    started=started,
                    finished=finished,
                    message=f"Association failed before relay method: {errc}",
                    code="RELAY_ASSOC_FAILED",
                    details={"phase": errc, "tcpEndpoint": endpoint},
                    transport_attempted=True,
                    association_attempted=True,
                )
            ok_m, em = _gurux_invoke_disconnect_control_method(
                client, transport, gx, dc_obj, method_index
            )
            if gx is not None:
                try:
                    client._try_gurux_disconnect(transport, gx)
                except Exception:  # noqa: BLE001
                    pass
            finished = datetime.now(timezone.utc)
            if not ok_m:
                err_code, detail_txt = _classify_relay_cosem_method_detail(em)
                return _relay_fail(
                    meter_id=request.meterId,
                    operation=operation,
                    started=started,
                    finished=finished,
                    message=f"Relay COSEM method failed: {detail_txt}",
                    code=err_code,
                    details={"method": method_index, "detail": em, "tcpEndpoint": endpoint},
                    transport_attempted=True,
                    association_attempted=True,
                    association_succeeded=True,
                    verified=False,
                )
        else:
            ser, gx, _port, errc = _serial_assoc(client)
            transport = ser
            if errc:
                finished = datetime.now(timezone.utc)
                return _relay_fail(
                    meter_id=request.meterId,
                    operation=operation,
                    started=started,
                    finished=finished,
                    message=f"Association failed before relay method: {errc}",
                    code="RELAY_ASSOC_FAILED",
                    details={"phase": errc},
                    transport_attempted=True,
                    association_attempted=True,
                )
            ok_m, em = _gurux_invoke_disconnect_control_method(
                client, ser, gx, dc_obj, method_index
            )
            if gx is not None:
                try:
                    client._try_gurux_disconnect(ser, gx)
                except Exception:  # noqa: BLE001
                    pass
            try:
                ser.close()
            except Exception:  # noqa: BLE001
                pass
            finished = datetime.now(timezone.utc)
            if not ok_m:
                err_code, detail_txt = _classify_relay_cosem_method_detail(em)
                return _relay_fail(
                    meter_id=request.meterId,
                    operation=operation,
                    started=started,
                    finished=finished,
                    message=f"Relay COSEM method failed: {detail_txt}",
                    code=err_code,
                    details={"method": method_index, "detail": em},
                    transport_attempted=True,
                    association_attempted=True,
                    association_succeeded=True,
                    verified=False,
                )

        finished = datetime.now(timezone.utc)
        payload = RelayControlPayload(
            relayState=expected_state,  # type: ignore[arg-type]
            logicalName=ln,
            methodExecuted=method_index,
        )
        label = "disconnect" if method_index == 1 else "reconnect"
        return _relay_ok(
            meter_id=request.meterId,
            operation=operation,
            started=started,
            finished=finished,
            message=f"Remote {label} method {method_index} executed on {ln!r} (posture assumed {expected_state!r}).",
            payload=payload,
            transport_attempted=True,
            association_attempted=True,
            verified=True,
            detail_code="RELAY_METHOD_OK",
        )
    finally:
        if sock is not None:
            try:
                sock.close()
            except Exception:  # noqa: BLE001
                pass


def _relay_method_inbound(
    request: ReadIdentityRequest,
    sock: socket.socket,
    remote_endpoint: str,
    operation: RuntimeOperation,
    method_index: int,
    expected_state: str,
) -> RuntimeResponseEnvelope:
    settings = get_settings()
    started = datetime.now(timezone.utc)
    boot = mvp_ami_bootstrap(settings, None)
    if isinstance(boot, MvpAmiBootstrapFailure):
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation=operation,
            started=started,
            finished=finished,
            message=boot.message,
            code=boot.code,
            details={**(boot.details or {}), "transportMode": "tcp_inbound"},
        )

    ln = (settings.relay_disconnect_control_ln or "0.0.96.3.10.255").strip()
    mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
    mc_logger.setLevel(settings.log_level.upper())
    try:
        dc_obj = _disconnect_control_object(ln)
    except Exception as exc:  # noqa: BLE001
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation=operation,
            started=started,
            finished=finished,
            message=f"Gurux disconnect-control class unavailable: {exc}",
            code="RELAY_GURUX_CLASS_MISSING",
            details={"error": str(exc), "transportMode": "tcp_inbound"},
        )

    try:
        client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
    except Exception as exc:  # noqa: BLE001
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation=operation,
            started=started,
            finished=finished,
            message=f"MVP-AMI MeterClient construct failed: {exc}",
            code="MVP_AMI_RUNTIME_ERROR",
            details={"error": str(exc), "transportMode": "tcp_inbound"},
        )

    transport, gx, errc = _tcp_assoc(client, sock)
    if errc:
        finished = datetime.now(timezone.utc)
        return _relay_fail(
            meter_id=request.meterId,
            operation=operation,
            started=started,
            finished=finished,
            message=f"Association failed before relay method: {errc}",
            code="RELAY_ASSOC_FAILED",
            details={"phase": errc, "tcpEndpoint": remote_endpoint, "transportMode": "tcp_inbound"},
            transport_attempted=True,
            association_attempted=True,
        )
    ok_m, em = _gurux_invoke_disconnect_control_method(
        client, transport, gx, dc_obj, method_index
    )
    if gx is not None:
        try:
            client._try_gurux_disconnect(transport, gx)
        except Exception:  # noqa: BLE001
            pass
    finished = datetime.now(timezone.utc)
    if not ok_m:
        err_code, detail_txt = _classify_relay_cosem_method_detail(em)
        return _relay_fail(
            meter_id=request.meterId,
            operation=operation,
            started=started,
            finished=finished,
            message=f"Inbound relay COSEM method failed: {detail_txt}",
            code=err_code,
            details={
                "method": method_index,
                "detail": em,
                "tcpEndpoint": remote_endpoint,
                "transportMode": "tcp_inbound",
            },
            transport_attempted=True,
            association_attempted=True,
            association_succeeded=True,
            verified=False,
        )

    payload = RelayControlPayload(
        relayState=expected_state,  # type: ignore[arg-type]
        logicalName=ln,
        methodExecuted=method_index,
    )
    label = "disconnect" if method_index == 1 else "reconnect"
    return _relay_ok(
        meter_id=request.meterId,
        operation=operation,
        started=started,
        finished=finished,
        message=f"Inbound remote {label} method {method_index} on {ln!r} ({remote_endpoint}).",
        payload=payload,
        transport_attempted=True,
        association_attempted=True,
        verified=True,
        detail_code="RELAY_METHOD_INBOUND_OK",
    )


def relay_disconnect(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    return _relay_method_direct(request, "relayDisconnect", 1, "off")


def relay_reconnect(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    return _relay_method_direct(request, "relayReconnect", 2, "on")


def relay_disconnect_inbound(
    request: ReadIdentityRequest,
    sock: socket.socket,
    remote_endpoint: str,
) -> RuntimeResponseEnvelope:
    return _relay_method_inbound(request, sock, remote_endpoint, "relayDisconnect", 1, "off")


def relay_reconnect_inbound(
    request: ReadIdentityRequest,
    sock: socket.socket,
    remote_endpoint: str,
) -> RuntimeResponseEnvelope:
    return _relay_method_inbound(request, sock, remote_endpoint, "relayReconnect", 2, "on")
