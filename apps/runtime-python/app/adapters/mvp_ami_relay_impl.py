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
from app.adapters.relay_semantic_profile import (
    RELAY_PROFILE_STANDARD,
    normalize_relay_disconnect_control_row,
    relay_diagnostics_for_command_verify,
    resolve_relay_profile_id,
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
    """
    Legacy normalizer for generic MVP-AMI rows (e.g. GXDLMSData reads on 0.0.96.*).
    Python bool subclasses int — handle bool before int.
    """
    if row.get("error"):
        return "unknown"
    v = row.get("value")
    vs = str(row.get("value_str") or "").strip().lower()
    if isinstance(v, bool):
        return "on" if v else "off"
    if vs in ("true", "false"):
        return "on" if vs == "true" else "off"
    if isinstance(v, (int, float)) and not isinstance(v, bool):  # bool subclasses int
        vi = int(v)
        # Blue book style (common on generic Data decodes): 1=disconnected, 2=connected.
        if vi == 2:
            return "on"
        if vi == 1:
            return "off"
        if vi == 0:
            return "off"
    if "disconnect" in vs or vs in ("off", "open"):
        return "off"
    if "connect" in vs or vs in ("on", "closed", "close"):
        return "on"
    if vs in ("1", "2", "0"):
        return _parse_relay_state_from_row({"value": int(vs), "value_str": "", "error": None})
    return "unknown"


def _relay_state_and_raw_from_row(
    row: dict,
    *,
    meter_serial: str = "",
    profile_id: Optional[str] = None,
) -> Tuple[str, str]:
    """
    Backward-compatible state + raw display. When strategy is disconnect_control and meter_serial
    is set, uses relay profile resolution; otherwise standard profile only.
    """
    if not isinstance(row, dict):
        return "unknown", ""
    if row.get("strategy") == "disconnect_control":
        mid = meter_serial or ""
        pid = profile_id or (resolve_relay_profile_id(mid) if mid else RELAY_PROFILE_STANDARD)
        st, raw, _diag = normalize_relay_disconnect_control_row(
            row, profile_id=pid, meter_serial=mid or "unknown"
        )
        return st, raw
    st = _parse_relay_state_from_row(row)
    raw = str(row.get("value_str") or row.get("value") or "").strip()
    return st, raw


def _state_and_raw_from_meter_result(result: Any, ln: str) -> Tuple[str, str]:
    pv = getattr(result, "parsed_values", None) or {}
    row = pv.get(ln) if isinstance(pv, dict) else None
    if not isinstance(row, dict):
        return "unknown", ""
    return _relay_state_and_raw_from_row(row)


def _relay_status_debug_type_name(v: Any) -> str:
    if v is None:
        return "NoneType"
    t = type(v)
    return f"{getattr(t, '__module__', '?')}.{getattr(t, '__qualname__', type(v).__name__)}"


def _read_disconnect_control_row(meter_client: Any, transport: Any, gx: Any, ln: str) -> dict[str, Any]:
    """
    Read class 70 disconnect control as GXDLMSDisconnectControl — not GXDLMSData@2
    (MVP-AMI phase1 uses Data for 0.0.96.*, which mis-reads this LN).
    Tries attribute 2 (outputState, boolean) then 3 (controlState, enum).

    TEMPORARY: always issues GET for attrs 2 and 3 so logs capture both raw values
    (one extra DLMS round-trip when attr2 alone would suffice). Remove when mapping is final.
    """
    from gurux_dlms.objects.GXDLMSDisconnectControl import GXDLMSDisconnectControl

    dc = GXDLMSDisconnectControl(ln)
    row: dict[str, Any] = {
        "strategy": "disconnect_control",
        "error": None,
        "logical_name": ln,
        "attr2_ok": False,
        "attr3_ok": False,
        "attr2_err": None,
        "attr3_err": None,
    }

    _v2, e2 = meter_client._gurux_read_attribute(transport, gx, dc, 2)
    row["attr2_ok"] = e2 is None
    row["attr2_err"] = str(e2) if e2 else None
    out_b = getattr(dc, "outputState", None)
    log.info(
        "RELAY_STATUS_DEBUG ln=%s attr2_ok=%s attr2_err=%s attr2_gurux_return=%r attr2_gurux_return_type=%s "
        "outputState_field=%r outputState_field_type=%s",
        ln,
        e2 is None,
        e2,
        _v2,
        _relay_status_debug_type_name(_v2),
        out_b,
        _relay_status_debug_type_name(out_b),
    )

    _v3, e3 = meter_client._gurux_read_attribute(transport, gx, dc, 3)
    row["attr3_ok"] = e3 is None
    row["attr3_err"] = str(e3) if e3 else None
    cs = getattr(dc, "controlState", None)
    log.info(
        "RELAY_STATUS_DEBUG ln=%s attr3_ok=%s attr3_err=%s attr3_gurux_return=%r attr3_gurux_return_type=%s "
        "controlState_field=%r controlState_field_type=%s",
        ln,
        e3 is None,
        e3,
        _v3,
        _relay_status_debug_type_name(_v3),
        cs,
        _relay_status_debug_type_name(cs),
    )

    ci: Optional[int] = None
    if cs is not None:
        try:
            ci = int(cs)
        except (TypeError, ValueError):
            ci = None

    if e2 is None and isinstance(out_b, bool):
        row["output_state"] = out_b
        if ci is not None:
            row["control_state"] = ci
        row["value"] = out_b
        row["value_str"] = "true" if out_b else "false"
        log.info(
            "RELAY_STATUS_DEBUG ln=%s row_branch=attr2_bool controlState_raw_for_ref=%r int(controlState)=%s",
            ln,
            cs,
            ci,
        )
        return row

    if e3 is None and ci is not None:
        if isinstance(out_b, bool):
            row["output_state"] = out_b
        row["control_state"] = ci
        row["value"] = ci
        row["value_str"] = str(cs)
        log.info(
            "RELAY_STATUS_DEBUG ln=%s row_branch=attr3_enum outputState_raw_for_ref=%r",
            ln,
            out_b,
        )
        return row

    row["error"] = "; ".join(
        x for x in (f"attr2={e2}" if e2 else None, f"attr3={e3}" if e3 else None) if x
    ) or "disconnect_control_read_failed"
    log.warning(
        "relay_disconnect_control_read_failed",
        extra={"ln": ln, "attr2_err": e2, "attr3_err": e3},
    )
    log.info(
        "RELAY_STATUS_DEBUG ln=%s row_branch=failed outputState=%r controlState=%r int_cs=%s",
        ln,
        out_b,
        cs,
        ci,
    )
    return row


def _finalize_relay_read_status(
    *,
    request: ReadIdentityRequest,
    started: datetime,
    ln: str,
    row: dict[str, Any],
    transport_attempted: bool,
    association_attempted: bool,
    association_failed: bool,
    message_prefix: str,
    detail_ok: str,
    detail_unverified: str,
    fail_details: Optional[dict] = None,
    endpoint_note: Optional[str] = None,
) -> RuntimeResponseEnvelope:
    finished = datetime.now(timezone.utc)
    if association_failed:
        log.info(
            "RELAY_STATUS_DEBUG meterId=%s ln=%s outcome=assoc_fail detail_code=RELAY_ASSOC_FAILED",
            request.meterId,
            ln,
        )
        return _relay_fail(
            meter_id=request.meterId,
            operation="relayReadStatus",
            started=started,
            finished=finished,
            message=f"{message_prefix}: association failed before disconnect-control read.",
            code="RELAY_ASSOC_FAILED",
            details=fail_details,
            transport_attempted=transport_attempted,
            association_attempted=association_attempted,
        )
    if row.get("error"):
        log.info(
            "RELAY_STATUS_DEBUG meterId=%s ln=%s outcome=read_fail detail_code=RELAY_STATUS_DISCONNECT_READ_FAILED err=%s",
            request.meterId,
            ln,
            row.get("error"),
        )
        return _relay_fail(
            meter_id=request.meterId,
            operation="relayReadStatus",
            started=started,
            finished=finished,
            message=f"{message_prefix}: disconnect-control read failed ({row.get('error')}).",
            code="RELAY_STATUS_DISCONNECT_READ_FAILED",
            details={
                **(fail_details or {}),
                "detail": row.get("error"),
                "logicalName": ln,
                "relayProfileId": resolve_relay_profile_id(request.meterId),
            },
            transport_attempted=transport_attempted,
            association_attempted=association_attempted,
        )
    profile_id = resolve_relay_profile_id(request.meterId)
    if row.get("strategy") == "disconnect_control":
        st, raw, diag = normalize_relay_disconnect_control_row(
            row, profile_id=profile_id, meter_serial=request.meterId
        )
    else:
        st, raw = _relay_state_and_raw_from_row(
            row, meter_serial=request.meterId, profile_id=profile_id
        )
        diag = {
            "targetMeterSerial": request.meterId.strip(),
            "relayProfileId": profile_id,
            "interpretationRule": "non_disconnect_control_row",
            "normalizedRelayState": st,
        }
    if isinstance(fail_details, dict):
        for k in ("transportMode", "tcpEndpoint"):
            if k in fail_details and fail_details[k] is not None:
                diag[k] = fail_details[k]
    ok_wire = st != "unknown"
    chosen_detail = detail_ok if ok_wire else detail_unverified
    diag["verifiedOnWire"] = ok_wire
    diag["detailCode"] = chosen_detail
    log.info(
        "RELAY_STATUS_DEBUG meterId=%s ln=%s outcome=ok normalized_relayState=%s detail_code=%s raw_display=%r",
        request.meterId,
        ln,
        st,
        chosen_detail,
        raw,
    )
    log.info(
        "relay_read_status_normalize",
        extra={
            "meter_id": request.meterId,
            "ln": ln,
            "relay_profile_id": profile_id,
            "normalized_relay_state": st,
            "interpretation_rule": diag.get("interpretationRule"),
            "output_state_bool": diag.get("outputStateBool"),
            "control_state_int": diag.get("controlStateInt"),
            "detail_code": chosen_detail,
            "verified_on_wire": ok_wire,
        },
    )
    payload = RelayControlPayload(
        relayState=st,  # type: ignore[arg-type]
        rawDisplay=raw or None,
        logicalName=ln,
        relayProfileId=profile_id,
        relayDiagnostics=diag,
    )
    ep = f" ({endpoint_note})" if endpoint_note else ""
    return _relay_ok(
        meter_id=request.meterId,
        operation="relayReadStatus",
        started=started,
        finished=finished,
        message=f"{message_prefix} {ln!r}{ep} (normalized={st!r}).",
        payload=payload,
        transport_attempted=transport_attempted,
        association_attempted=association_attempted,
        verified=ok_wire,
        detail_code=chosen_detail,
    )


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
        sock: Optional[socket.socket] = None
        row: dict[str, Any] = {}
        try:
            sock = socket.create_connection((host, int(port)), timeout=timeout)
            transport, gx, errc = _tcp_assoc(client, sock)
            if errc:
                return _finalize_relay_read_status(
                    request=request,
                    started=started,
                    ln=ln,
                    row={},
                    transport_attempted=True,
                    association_attempted=True,
                    association_failed=True,
                    message_prefix="Relay status",
                    detail_ok="RELAY_STATUS_OK",
                    detail_unverified="RELAY_STATUS_UNVERIFIED",
                    fail_details={"phase": errc, "tcpEndpoint": endpoint},
                )
            row = _read_disconnect_control_row(client, transport, gx, ln)
            if gx is not None:
                try:
                    client._try_gurux_disconnect(transport, gx)
                except Exception:  # noqa: BLE001
                    pass
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
        return _finalize_relay_read_status(
            request=request,
            started=started,
            ln=ln,
            row=row,
            transport_attempted=True,
            association_attempted=True,
            association_failed=False,
            message_prefix="Disconnect-control read",
            detail_ok="RELAY_STATUS_OK",
            detail_unverified="RELAY_STATUS_UNVERIFIED",
            fail_details={"tcpEndpoint": endpoint},
            endpoint_note=endpoint,
        )
    else:
        row = {}
        ser: Any = None
        try:
            ser, gx, _port, errc = _serial_assoc(client)
            if errc:
                return _finalize_relay_read_status(
                    request=request,
                    started=started,
                    ln=ln,
                    row={},
                    transport_attempted=True,
                    association_attempted=True,
                    association_failed=True,
                    message_prefix="Relay status",
                    detail_ok="RELAY_STATUS_OK",
                    detail_unverified="RELAY_STATUS_UNVERIFIED",
                    fail_details={"phase": errc},
                )
            row = _read_disconnect_control_row(client, ser, gx, ln)
            if gx is not None:
                try:
                    client._try_gurux_disconnect(ser, gx)
                except Exception:  # noqa: BLE001
                    pass
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
        finally:
            if ser is not None:
                try:
                    ser.close()
                except Exception:  # noqa: BLE001
                    pass

        return _finalize_relay_read_status(
            request=request,
            started=started,
            ln=ln,
            row=row,
            transport_attempted=True,
            association_attempted=True,
            association_failed=False,
            message_prefix="Disconnect-control read",
            detail_ok="RELAY_STATUS_OK",
            detail_unverified="RELAY_STATUS_UNVERIFIED",
            fail_details=None,
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

    try:
        transport, gx, errc = _tcp_assoc(client, sock)
        if errc:
            return _finalize_relay_read_status(
                request=request,
                started=started,
                ln=ln,
                row={},
                transport_attempted=True,
                association_attempted=True,
                association_failed=True,
                message_prefix="Inbound relay status",
                detail_ok="RELAY_STATUS_INBOUND_OK",
                detail_unverified="RELAY_STATUS_INBOUND_UNVERIFIED",
                fail_details={
                    "phase": errc,
                    "tcpEndpoint": remote_endpoint,
                    "transportMode": "tcp_inbound",
                },
            )
        row = _read_disconnect_control_row(client, transport, gx, ln)
        if gx is not None:
            try:
                client._try_gurux_disconnect(transport, gx)
            except Exception:  # noqa: BLE001
                pass
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

    fd = {
        "tcpEndpoint": remote_endpoint,
        "transportMode": "tcp_inbound",
    }
    return _finalize_relay_read_status(
        request=request,
        started=started,
        ln=ln,
        row=row,
        transport_attempted=True,
        association_attempted=True,
        association_failed=False,
        message_prefix="Inbound disconnect-control read",
        detail_ok="RELAY_STATUS_INBOUND_OK",
        detail_unverified="RELAY_STATUS_INBOUND_UNVERIFIED",
        fail_details=fd,
        endpoint_note=remote_endpoint,
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
    profile_id = resolve_relay_profile_id(request.meterId, settings)
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
            details={
                "phase": errc,
                "tcpEndpoint": remote_endpoint,
                "transportMode": "tcp_inbound",
                "relayProfileId": profile_id,
            },
            transport_attempted=True,
            association_attempted=True,
        )
    ok_m, em = _gurux_invoke_disconnect_control_method(
        client, transport, gx, dc_obj, method_index
    )
    post_row: dict[str, Any] = {}
    st_post = "unknown"
    raw_post = ""
    post_read_err: Optional[str] = None
    diag: dict[str, Any]
    if ok_m and gx is not None:
        post_row = _read_disconnect_control_row(client, transport, gx, ln)
        post_read_err = post_row.get("error")
        st_post, raw_post, diag = normalize_relay_disconnect_control_row(
            post_row, profile_id=profile_id, meter_serial=request.meterId
        )
    elif ok_m:
        post_read_err = "no_gurux_context_for_post_read"
        diag = {
            "targetMeterSerial": request.meterId.strip(),
            "relayProfileId": profile_id,
            "disconnectControlReadError": post_read_err,
            "interpretationRule": "no_gurux_context",
            "normalizedRelayState": "unknown",
        }

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
                "relayProfileId": profile_id,
            },
            transport_attempted=True,
            association_attempted=True,
            association_succeeded=True,
            verified=False,
        )

    label = "disconnect" if method_index == 1 else "reconnect"
    if post_read_err:
        verified = False
        relay_ui_state = "unknown"
        detail_code = "RELAY_METHOD_INBOUND_POST_READ_FAILED"
        msg = (
            f"Inbound remote {label} method {method_index} on {ln!r} ({remote_endpoint}); "
            f"post-read could not confirm state ({post_read_err})."
        )
    elif st_post == "unknown":
        verified = False
        relay_ui_state = "unknown"
        detail_code = "RELAY_METHOD_INBOUND_STATE_UNVERIFIED"
        msg = (
            f"Inbound remote {label} method {method_index} on {ln!r} ({remote_endpoint}); "
            "post-read normalized state is unknown."
        )
    elif st_post != expected_state:
        verified = False
        relay_ui_state = st_post  # type: ignore[assignment]
        detail_code = "RELAY_METHOD_INBOUND_STATE_MISMATCH"
        msg = (
            f"Inbound remote {label} method {method_index} on {ln!r} ({remote_endpoint}); "
            f"post-read shows {st_post!r}, expected {expected_state!r} after method."
        )
    else:
        verified = True
        relay_ui_state = st_post  # type: ignore[assignment]
        detail_code = "RELAY_METHOD_INBOUND_OK"
        msg = (
            f"Inbound remote {label} method {method_index} on {ln!r} ({remote_endpoint}); "
            f"post-read confirms {st_post!r}."
        )

    full_diag = relay_diagnostics_for_command_verify(
        diag,
        expected_state=expected_state,
        verified=verified,
        detail_code=detail_code,
        operation=operation,
        method_index=method_index,
        method_detail=str(em).strip() if em else None,
    )
    full_diag["tcpEndpoint"] = remote_endpoint
    full_diag["transportMode"] = "tcp_inbound"
    full_diag["relayMethodLabel"] = label

    log.info(
        "relay_method_inbound_post_verify",
        extra={
            "meter_id": request.meterId,
            "operation": operation,
            "method_index": method_index,
            "relay_profile_id": profile_id,
            "expected_state": expected_state,
            "post_relay_state": st_post,
            "interpretation_rule": diag.get("interpretationRule"),
            "output_state_bool": diag.get("outputStateBool"),
            "control_state_int": diag.get("controlStateInt"),
            "post_read_error": post_read_err,
            "raw_display": (raw_post or "")[:200],
            "verified_on_wire": verified,
            "detail_code": detail_code,
            "verification_disagrees": full_diag.get("verificationDisagreesWithExpected"),
            "tcp_endpoint": remote_endpoint,
        },
    )

    payload = RelayControlPayload(
        relayState=relay_ui_state,  # type: ignore[arg-type]
        logicalName=ln,
        methodExecuted=method_index,
        rawDisplay=raw_post or None,
        relayProfileId=profile_id,
        relayDiagnostics=full_diag,
    )
    return _relay_ok(
        meter_id=request.meterId,
        operation=operation,
        started=started,
        finished=finished,
        message=msg,
        payload=payload,
        transport_attempted=True,
        association_attempted=True,
        verified=verified,
        detail_code=detail_code,
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
