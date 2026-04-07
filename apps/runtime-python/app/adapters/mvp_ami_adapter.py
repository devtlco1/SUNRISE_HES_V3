"""
Host-initiated reads via MVP-AMI: `MeterClient.run_phase1` (serial) or `run_phase1_tcp_socket` (TCP client).

Requires a local checkout of https://github.com/devtlco1/MVP-AMI and a valid MVP-AMI `config.json`
(see `SUNRISE_RUNTIME_MVP_AMI_CONFIG_PATH` or `<root>/config.json`).
"""

from __future__ import annotations

import logging
import socket
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple, Union

from app.adapters.base import ProtocolRuntimeAdapter
from app.adapters.mvp_ami_relay_impl import _tcp_assoc
from app.adapters.mvp_ami_discovery import run_association_view_discovery
from app.adapters.obis_logical_name import (
    OBIS_SHAPE_INVALID_MESSAGE,
    obis_logical_name_structurally_valid,
)
from app.adapters.obis_selection_v1 import obis_selection_item_supported_v1
from app.adapters.mvp_ami_shared import (
    MvpAmiBootstrapFailure,
    channel_spec_is_tcp,
    diagnostic_dump,
    find_stage,
    mvp_ami_bootstrap,
)
from app.config import get_settings
from app.schemas.envelope import (
    AssociationViewInstrumentation,
    BasicRegisterReading,
    BasicRegistersPayload,
    DiscoveredObjectRow,
    DiscoverSupportedObisPayload,
    IdentityPayload,
    ObisSelectionRowResult,
    ReadObisSelectionPayload,
    RuntimeCapabilityStage,
    RuntimeErrorInfo,
    RuntimeExecutionDiagnostics,
    RuntimeOperation,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import (
    DiscoverSupportedObisRequest,
    ObisSelectionItem,
    ReadBasicRegistersRequest,
    ReadIdentityRequest,
    ReadObisSelectionRequest,
)

log = logging.getLogger(__name__)


def _iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _failure_envelope(
    *,
    meter_id: str,
    operation: RuntimeOperation,
    started: datetime,
    finished: datetime,
    message: str,
    code: str,
    transport_state: str,
    association_state: str,
    transport_attempted: bool,
    association_attempted: bool,
    verified: bool,
    outcome: str,
    detail_code: str,
    err_details: Optional[dict] = None,
    capability_stage: RuntimeCapabilityStage = "cosem_read",
    payload: Optional[Any] = None,
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
        transportState=transport_state,  # type: ignore[arg-type]
        associationState=association_state,  # type: ignore[arg-type]
        payload=payload,
        error=RuntimeErrorInfo(code=code, message=message, details=err_details),
        diagnostics=RuntimeExecutionDiagnostics(
            outcome=outcome,  # type: ignore[arg-type]
            capabilityStage=capability_stage,
            transportAttempted=transport_attempted,
            associationAttempted=association_attempted,
            verifiedOnWire=verified,
            detailCode=detail_code,
        ),
    )


def _success_envelope(
    *,
    meter_id: str,
    operation: RuntimeOperation,
    started: datetime,
    finished: datetime,
    payload: Union[IdentityPayload, BasicRegistersPayload, DiscoverSupportedObisPayload],
    message: str,
    transport_attempted: bool,
    association_attempted: bool,
    verified: bool,
    detail_code: Optional[str],
    outcome_override: Optional[str] = None,
    capability_stage: RuntimeCapabilityStage = "cosem_read",
) -> RuntimeResponseEnvelope:
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    out = outcome_override or ("verified_on_wire_success" if verified else "attempted_failed")
    return RuntimeResponseEnvelope(
        ok=True,
        simulated=False,
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
            capabilityStage=capability_stage,
            transportAttempted=transport_attempted,
            associationAttempted=association_attempted,
            verifiedOnWire=verified,
            detailCode=detail_code,
        ),
    )


def _identity_payload_from_obis_row(obis: str, row: dict) -> IdentityPayload:
    disp = (row.get("value_str") or "").strip()
    val = row.get("value")
    primary = disp or (str(val) if val is not None else "")
    if not primary:
        primary = "unknown"
    return IdentityPayload(
        serialNumber=primary,
        manufacturer="unknown",
        model="unknown",
        firmwareVersion="unknown",
        protocolVersion="DLMS/Gurux (MVP-AMI MeterClient)",
        logicalDeviceName=primary if primary != "unknown" else None,
    )


def _register_reading_from_row(row: dict) -> tuple[bool, BasicRegisterReading]:
    read_err = row.get("error")
    disp = (row.get("value_str") or "").strip()
    val = row.get("value")
    value_str = disp or (str(val) if val is not None else "")
    unit = row.get("unit")
    if isinstance(unit, str):
        u = unit.strip() or None
    else:
        u = None
    if read_err is not None or not value_str:
        return False, BasicRegisterReading(
            value="",
            unit=u,
            quality="error",
            error=str(read_err) if read_err is not None else "no value",
        )
    return True, BasicRegisterReading(value=value_str, unit=u, quality="good")


def _obis_selection_row_from_parsed(
    item: ObisSelectionItem,
    row: Any,
    last_at: str,
) -> ObisSelectionRowResult:
    r = row if isinstance(row, dict) else {}
    ok_read, reading = _register_reading_from_row(r)
    fmt = "clock" if (item.objectType or "").lower() == "clock" else "scalar"
    u = reading.unit or item.unit
    if ok_read:
        return ObisSelectionRowResult(
            obis=item.obis,
            value=reading.value,
            unit=u,
            quality=reading.quality or "good",
            status="ok",
            packKey=item.packKey,
            lastReadAt=last_at,
            resolvedResultFormat=fmt,
        )
    return ObisSelectionRowResult(
        obis=item.obis,
        value=reading.value,
        unit=u,
        quality=reading.quality,
        error=reading.error,
        status="error",
        packKey=item.packKey,
        lastReadAt=last_at,
        resolvedResultFormat=fmt,
    )


def _obis_list_from_settings(raw: str) -> List[str]:
    parts = [x.strip() for x in (raw or "").split(",") if x.strip()]
    return parts


def _catalog_integrity_note(
    instr: Optional[AssociationViewInstrumentation], row_count: int
) -> Optional[str]:
    """Honest operator-facing tag when objects[] is empty (snapshot consumers)."""
    if row_count > 0:
        return None
    if instr is None:
        return "empty_catalog_no_instrumentation"
    nd = instr.normalizationDecision
    lp = instr.rawObjectListLengthProbe or {}
    cnt = lp.get("count")
    if nd == "input_none":
        return "empty_after_read_objectlist_was_none"
    if nd == "not_iterable":
        return "empty_objectlist_not_iterable_see_raw_types"
    if nd == "read_failed":
        return "read_failed_see_error_envelope"
    if cnt == 0:
        return "empty_raw_objectlist_length_zero_after_successful_read"
    if cnt is None:
        return "empty_normalized_catalog_see_raw_length_probe"
    if instr.normalizationDroppedOrFailedCount > 0:
        return "empty_all_raw_rows_failed_normalization"
    return f"empty_unexpected_raw_count_{cnt}_normalization_input_{instr.normalizationInputCount}"


def _early_transport_failures(
    *,
    meter_id: str,
    operation: RuntimeOperation,
    started: datetime,
    finished: datetime,
    diags: List[Any],
    transport_layer: str = "serial",
    envelope_transport_mode: str = "serial",
) -> Optional[RuntimeResponseEnvelope]:
    open_d = find_stage(diags, "open_port")
    assoc_d = find_stage(diags, "association")
    init_d = find_stage(diags, "initial_request")
    diag_dump = diagnostic_dump(diags)

    if transport_layer == "serial":
        transport_ok = bool(open_d and open_d.success)
        if not transport_ok:
            return _failure_envelope(
                meter_id=meter_id,
                operation=operation,
                started=started,
                finished=finished,
                message="Serial port did not open (see diagnostics).",
                code="SERIAL_OPEN_FAILED",
                transport_state="error",
                association_state="none",
                transport_attempted=open_d is not None,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="SERIAL_OPEN_FAILED",
                err_details={"mvpAmiDiagnostics": diag_dump, "transportMode": "serial"},
            )
    else:
        tcp_rt = find_stage(diags, "phase1_runtime_tcp")
        if tcp_rt is not None and not tcp_rt.success:
            return _failure_envelope(
                meter_id=meter_id,
                operation=operation,
                started=started,
                finished=finished,
                message="MVP-AMI TCP phase1 raised an internal error (see diagnostics).",
                code="MVP_AMI_TCP_PHASE1_RUNTIME_ERROR",
                transport_state="error",
                association_state="none",
                transport_attempted=True,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_TCP_PHASE1_RUNTIME_ERROR",
                err_details={
                    "mvpAmiDiagnostics": diag_dump,
                    "transportMode": envelope_transport_mode,
                    "phase1RuntimeTcp": getattr(tcp_rt, "details", {}) or {},
                },
            )

    if init_d is not None and not init_d.success:
        return _failure_envelope(
            meter_id=meter_id,
            operation=operation,
            started=started,
            finished=finished,
            message="IEC identification / ACK phase did not succeed (MVP-AMI initial_request).",
            code="IEC_HANDSHAKE_FAILED",
            transport_state="error",
            association_state="none",
            transport_attempted=True,
            association_attempted=False,
            verified=False,
            outcome="attempted_failed",
            detail_code="IEC_HANDSHAKE_FAILED",
            err_details={
                "mvpAmiDiagnostics": diag_dump,
                "transportMode": envelope_transport_mode,
            },
        )

    if assoc_d is None:
        cancel_d = find_stage(diags, "cancelled")
        if cancel_d is not None:
            return _failure_envelope(
                meter_id=meter_id,
                operation=operation,
                started=started,
                finished=finished,
                message="MVP-AMI read was cancelled before association completed.",
                code="MVP_AMI_CANCELLED",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=True,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_CANCELLED",
                err_details={
                    "mvpAmiDiagnostics": diag_dump,
                    "transportMode": envelope_transport_mode,
                },
            )
        return _failure_envelope(
            meter_id=meter_id,
            operation=operation,
            started=started,
            finished=finished,
            message="Association stage did not run (unexpected MVP-AMI pipeline state).",
            code="ASSOCIATION_NOT_REACHED",
            transport_state="error",
            association_state="none",
            transport_attempted=True,
            association_attempted=False,
            verified=False,
            outcome="attempted_failed",
            detail_code="ASSOCIATION_NOT_REACHED",
            err_details={
                "mvpAmiDiagnostics": diag_dump,
                "transportMode": envelope_transport_mode,
            },
        )

    if not assoc_d.success:
        return _failure_envelope(
            meter_id=meter_id,
            operation=operation,
            started=started,
            finished=finished,
            message="DLMS association did not complete successfully (see diagnostics).",
            code="ASSOCIATION_FAILED",
            transport_state="disconnected",
            association_state="failed",
            transport_attempted=True,
            association_attempted=True,
            verified=False,
            outcome="attempted_failed",
            detail_code="ASSOCIATION_FAILED",
            err_details={
                "mvpAmiDiagnostics": diag_dump,
                "association": getattr(assoc_d, "details", {}),
                "transportMode": envelope_transport_mode,
            },
        )

    return None


def _prepare_obis_selection_slots(
    request: ReadObisSelectionRequest,
) -> tuple[List[Optional[ObisSelectionRowResult]], List[str], List[int]]:
    items = request.selectedItems
    n = len(items)
    slots: List[Optional[ObisSelectionRowResult]] = [None] * n
    now = datetime.now(timezone.utc)
    last_at = _iso_z(now)
    wire_unique: List[str] = []
    seen: set[str] = set()
    wire_indices: List[int] = []

    for i, item in enumerate(items):
        ok, reason = obis_selection_item_supported_v1(item)
        if not ok:
            slots[i] = ObisSelectionRowResult(
                obis=item.obis,
                status="unsupported",
                error=reason,
                packKey=item.packKey,
                lastReadAt=last_at,
            )
            continue
        ln_ok, _ln_tag = obis_logical_name_structurally_valid(item.obis)
        if not ln_ok:
            slots[i] = ObisSelectionRowResult(
                obis=item.obis,
                value="",
                status="error",
                error=OBIS_SHAPE_INVALID_MESSAGE,
                packKey=item.packKey,
                lastReadAt=last_at,
            )
            continue
        wire_indices.append(i)
        if item.obis not in seen:
            seen.add(item.obis)
            wire_unique.append(item.obis)

    return slots, wire_unique, wire_indices


def _obis_read_error_is_fatal(exc: BaseException) -> bool:
    """True when the DLMS/TCP session is likely unusable; row-level COSEM errors stay False."""
    if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
        return True
    msg = str(exc).lower()
    for needle in (
        "broken pipe",
        "connection reset",
        "not connected",
        "connection aborted",
        "bad file descriptor",
    ):
        if needle in msg:
            return True
    return False


def _mark_wire_remaining_not_attempted(
    slots: List[Optional[ObisSelectionRowResult]],
    items: List[ObisSelectionItem],
    wire_indices: List[int],
    failed_wi: int,
) -> None:
    try:
        pos = wire_indices.index(failed_wi)
    except ValueError:
        return
    last_at = _iso_z(datetime.now(timezone.utc))
    for wj in wire_indices[pos + 1 :]:
        it = items[wj]
        slots[wj] = ObisSelectionRowResult(
            obis=it.obis,
            value="",
            status="not_attempted",
            error="Not attempted (transport/session ended after earlier failure)",
            packKey=it.packKey,
            lastReadAt=last_at,
        )


_SKIP_QUEUE_REASON = "removed_from_queue_by_operator"
_CANCEL_BATCH_REASON = "Cancelled by operator"
# Remaining wire rows after a clearly dead session / transport (first matching error stops the tail).
_SESSION_STOPPED_REASON = "Session stopped — transport or framing unusable."
# Two consecutive wire errors that are neither clearly session-broken nor ordinary row-level COSEM faults.
_BATCH_STOPPED_AMBIGUOUS_REASON = "Batch stopped — repeated ambiguous errors (session uncertain)."

# Long inbound batches: DLMS/HDLC over staged TCP degrades after many sequential GETs (~12–13 observed).
# Chunk wire reads with a full IEC + association refresh between chunks (same TCP socket, same job id).
INBOUND_OBIS_WIRE_CHUNK_SIZE = 8
INBOUND_OBIS_INTER_CHUNK_SLEEP_SEC = 0.08


def _inbound_session_retry_warranted(text: str) -> bool:
    """One bounded refresh+retry is only for transport/session degradation — not meter-local COSEM faults."""
    if not (text or "").strip():
        return False
    if _ordinary_row_error_message(text):
        return False
    return _session_broken_message(text)


def _session_broken_message(text: str) -> bool:
    """True when the TCP/DLMS/HDLC session is almost certainly unusable — stop the wire tail immediately."""
    t = (text or "").lower()
    if any(
        n in t
        for n in (
            "invalid hdlc frame",
            "expected: 0x3e",
            "read_deadline",
            "broken pipe",
            "connection reset",
            "connection aborted",
            "bad file descriptor",
            "not connected",
            "end of file",
            "unexpected eof",
            "errno 32",  # broken pipe (some stacks)
            "errno 54",  # connection reset (BSD/macOS style)
            "errno 104",  # connection reset (Linux)
            "lost synchronization",
            "out of sync",
            "framing",
            "deserialize",
            "serialization",
        )
    ):
        return True
    if "association" in t and any(x in t for x in ("fail", "reject", "refused", "error", "abort")):
        return True
    if "timeout" in t and any(x in t for x in ("hdlc", "dlms", "socket", "tcp", "iec", "read")):
        return True
    return False


def _ordinary_row_error_message(text: str) -> bool:
    """Row-level COSEM / meter faults where continuing other reads is still reasonable."""
    t = (text or "").lower()
    return any(
        n in t
        for n in (
            "access denied",
            "read-write denied",
            "object unavailable",
            "object unknown",
            "unknown object",
            "undefined object",
            "hardware fault",
            "data not ready",
            "type does not match",
            "object attribute",
            "temporary failure",
        )
    )


def _mark_wire_forward_from_index(
    slots: List[Optional[ObisSelectionRowResult]],
    items: List[ObisSelectionItem],
    wire_indices: List[int],
    from_wi: int,
    error_message: str,
    row_phase: str,
    progress: Optional[Callable[[Dict[str, Any]], None]],
    done: int,
    total_w: int,
) -> int:
    """Mark wire rows from from_wi (inclusive) to end of wire order as not_attempted."""
    try:
        pos = wire_indices.index(from_wi)
    except ValueError:
        return done
    last_at = _iso_z(datetime.now(timezone.utc))
    for wj in wire_indices[pos:]:
        cell = slots[wj]
        if cell is not None and getattr(cell, "status", None) == "ok":
            continue
        it = items[wj]
        slots[wj] = ObisSelectionRowResult(
            obis=it.obis,
            value="",
            status="not_attempted",
            error=error_message,
            packKey=it.packKey,
            lastReadAt=last_at,
        )
        done += 1
        if progress:
            progress(
                {
                    "rowDoneIndex": wj,
                    "row": slots[wj].model_dump(mode="json"),
                    "rowPhase": row_phase,
                    "completedWire": done,
                    "totalWire": total_w,
                }
            )
    return done


def _mark_wire_after_index(
    slots: List[Optional[ObisSelectionRowResult]],
    items: List[ObisSelectionItem],
    wire_indices: List[int],
    after_wi: int,
    error_message: str,
    row_phase: str,
    progress: Optional[Callable[[Dict[str, Any]], None]],
    done: int,
    total_w: int,
) -> int:
    """Mark wire rows strictly after after_wi in wire order."""
    try:
        pos = wire_indices.index(after_wi)
    except ValueError:
        return done
    last_at = _iso_z(datetime.now(timezone.utc))
    for wj in wire_indices[pos + 1 :]:
        it = items[wj]
        slots[wj] = ObisSelectionRowResult(
            obis=it.obis,
            value="",
            status="not_attempted",
            error=error_message,
            packKey=it.packKey,
            lastReadAt=last_at,
        )
        done += 1
        if progress:
            progress(
                {
                    "rowDoneIndex": wj,
                    "row": slots[wj].model_dump(mode="json"),
                    "rowPhase": row_phase,
                    "completedWire": done,
                    "totalWire": total_w,
                }
            )
    return done


def _sequential_obis_wire_loop(
    client: Any,
    transport: Any,
    request: ReadObisSelectionRequest,
    slots: List[Optional[ObisSelectionRowResult]],
    wire_indices: List[int],
    progress: Optional[Callable[[Dict[str, Any]], None]] = None,
    abort_check: Optional[Callable[[], Optional[str]]] = None,
    skip_check: Optional[Callable[[int], bool]] = None,
    total_wire_global: Optional[int] = None,
    completed_wire_base: int = 0,
    chunk_indices: Optional[List[int]] = None,
    session_pair: Optional[List[Any]] = None,
    refresh_session: Optional[Callable[[], Tuple[Any, Any, Optional[str]]]] = None,
) -> Tuple[Optional[str], int]:
    """
    After IEC + DLMS association on transport. Reads wire indices in order (full wire_indices or chunk_indices).

    Returns (fatal_error_or_none, completed_wire_count) for UI progress; fatal non-None stops the inbound job driver.
    """
    items = request.selectedItems
    total_w = len(wire_indices) if total_wire_global is None else int(total_wire_global)
    done = int(completed_wire_base)
    pair: List[Any] = session_pair if session_pair is not None else [transport, getattr(client, "_gurux_client", None)]
    to_process = chunk_indices if chunk_indices is not None else wire_indices

    if pair[1] is None:
        last_at = _iso_z(datetime.now(timezone.utc))
        for wi in to_process:
            item = items[wi]
            slots[wi] = ObisSelectionRowResult(
                obis=item.obis,
                value="",
                status="error",
                error="MVP-AMI internal error: gurux client not available",
                packKey=item.packKey,
                lastReadAt=last_at,
            )
            done += 1
            if progress:
                progress(
                    {
                        "rowDoneIndex": wi,
                        "row": slots[wi].model_dump(mode="json"),
                        "completedWire": done,
                        "totalWire": total_w,
                    }
                )
        return None, done

    consecutive_ambiguous_wire_errors = 0
    for wi in to_process:
        item = items[wi]

        if slots[wi] is not None:
            continue

        if skip_check and skip_check(wi):
            last_at = _iso_z(datetime.now(timezone.utc))
            slots[wi] = ObisSelectionRowResult(
                obis=item.obis,
                value="",
                status="not_attempted",
                error=_SKIP_QUEUE_REASON,
                packKey=item.packKey,
                lastReadAt=last_at,
            )
            done += 1
            consecutive_ambiguous_wire_errors = 0
            if progress:
                progress(
                    {
                        "rowDoneIndex": wi,
                        "row": slots[wi].model_dump(mode="json"),
                        "rowPhase": "skipped",
                        "completedWire": done,
                        "totalWire": total_w,
                    }
                )
            continue

        if abort_check:
            amsg = abort_check()
            if amsg:
                done = _mark_wire_forward_from_index(
                    slots,
                    items,
                    wire_indices,
                    wi,
                    amsg,
                    "cancelled",
                    progress,
                    done,
                    total_w,
                )
                return None, done

        if progress:
            progress(
                {
                    "currentIndex": wi,
                    "currentObis": item.obis,
                    "completedWire": done,
                    "totalWire": total_w,
                }
            )
        ln_ok, _ = obis_logical_name_structurally_valid(item.obis)
        if not ln_ok:
            last_at = _iso_z(datetime.now(timezone.utc))
            slots[wi] = ObisSelectionRowResult(
                obis=item.obis,
                value="",
                status="error",
                error=OBIS_SHAPE_INVALID_MESSAGE,
                packKey=item.packKey,
                lastReadAt=last_at,
            )
            done += 1
            consecutive_ambiguous_wire_errors = 0
            if progress:
                progress(
                    {
                        "rowDoneIndex": wi,
                        "row": slots[wi].model_dump(mode="json"),
                        "completedWire": done,
                        "totalWire": total_w,
                    }
                )
            continue

        session_retry_used = False
        chunk: Any = None
        while True:
            try:
                chunk = client._read_obis_via_gurux(
                    pair[0],
                    pair[1],
                    [item.obis],
                    progress_callback=None,
                    cancel_event=None,
                )
            except Exception as exc:  # noqa: BLE001
                err_blob = f"{exc}"
                if (
                    refresh_session is not None
                    and not session_retry_used
                    and _inbound_session_retry_warranted(err_blob)
                ):
                    t, g, e = refresh_session()
                    if e is None:
                        session_retry_used = True
                        pair[0] = t
                        pair[1] = g
                        continue
                log.exception(
                    "mvp_ami_sequential_obis_read_failed",
                    extra={"index": wi, "obis": item.obis, "session_retry": session_retry_used},
                )
                last_at = _iso_z(datetime.now(timezone.utc))
                slots[wi] = ObisSelectionRowResult(
                    obis=item.obis,
                    value="",
                    status="error",
                    error=f"read raised: {exc}"[:500],
                    packKey=item.packKey,
                    lastReadAt=last_at,
                )
                fatal = _obis_read_error_is_fatal(exc)
                err_blob = f"{exc} {slots[wi].error or ''}"
                done += 1
                if progress:
                    patch: Dict[str, Any] = {
                        "rowDoneIndex": wi,
                        "row": slots[wi].model_dump(mode="json"),
                        "completedWire": done,
                        "totalWire": total_w,
                    }
                    if fatal:
                        patch["fatal"] = True
                        patch["fatalMessage"] = str(exc)[:500]
                    progress(patch)
                if fatal:
                    _mark_wire_remaining_not_attempted(slots, items, wire_indices, wi)
                    try:
                        fail_pos = wire_indices.index(wi)
                    except ValueError:
                        fail_pos = -1
                    if progress and fail_pos >= 0:
                        for wj in wire_indices[fail_pos + 1 :]:
                            cell = slots[wj]
                            if cell is not None:
                                done += 1
                                progress(
                                    {
                                        "rowDoneIndex": wj,
                                        "row": cell.model_dump(mode="json"),
                                        "completedWire": done,
                                        "totalWire": total_w,
                                    }
                                )
                    return str(exc), done
                if _session_broken_message(err_blob):
                    done = _mark_wire_after_index(
                        slots,
                        items,
                        wire_indices,
                        wi,
                        _SESSION_STOPPED_REASON,
                        "not_attempted",
                        progress,
                        done,
                        total_w,
                    )
                    return None, done
                if _ordinary_row_error_message(err_blob):
                    consecutive_ambiguous_wire_errors = 0
                else:
                    consecutive_ambiguous_wire_errors += 1
                if consecutive_ambiguous_wire_errors >= 2:
                    done = _mark_wire_after_index(
                        slots,
                        items,
                        wire_indices,
                        wi,
                        _BATCH_STOPPED_AMBIGUOUS_REASON,
                        "not_attempted",
                        progress,
                        done,
                        total_w,
                    )
                    return None, done
                break

            row = chunk.get(item.obis) if isinstance(chunk, dict) else {}
            last_at = _iso_z(datetime.now(timezone.utc))
            slots[wi] = _obis_selection_row_from_parsed(item, row, last_at)
            cell = slots[wi]
            if cell is not None and cell.status == "error":
                et = cell.error or ""
                if (
                    refresh_session is not None
                    and not session_retry_used
                    and _inbound_session_retry_warranted(et)
                ):
                    t, g, e = refresh_session()
                    if e is None:
                        session_retry_used = True
                        pair[0] = t
                        pair[1] = g
                        continue
                done += 1
                if progress:
                    progress(
                        {
                            "rowDoneIndex": wi,
                            "row": slots[wi].model_dump(mode="json"),  # type: ignore[union-attr]
                            "completedWire": done,
                            "totalWire": total_w,
                        }
                    )
                if _session_broken_message(et):
                    done = _mark_wire_after_index(
                        slots,
                        items,
                        wire_indices,
                        wi,
                        _SESSION_STOPPED_REASON,
                        "not_attempted",
                        progress,
                        done,
                        total_w,
                    )
                    return None, done
                if _ordinary_row_error_message(et):
                    consecutive_ambiguous_wire_errors = 0
                else:
                    consecutive_ambiguous_wire_errors += 1
                if consecutive_ambiguous_wire_errors >= 2:
                    done = _mark_wire_after_index(
                        slots,
                        items,
                        wire_indices,
                        wi,
                        _BATCH_STOPPED_AMBIGUOUS_REASON,
                        "not_attempted",
                        progress,
                        done,
                        total_w,
                    )
                    return None, done
                break

            done += 1
            if progress:
                progress(
                    {
                        "rowDoneIndex": wi,
                        "row": slots[wi].model_dump(mode="json"),  # type: ignore[union-attr]
                        "completedWire": done,
                        "totalWire": total_w,
                    }
                )
            if cell is not None and cell.status == "ok":
                consecutive_ambiguous_wire_errors = 0
            elif cell is not None and cell.status == "unsupported":
                consecutive_ambiguous_wire_errors = 0
            else:
                consecutive_ambiguous_wire_errors = 0
            break

    return None, done


def _finalize_obis_selection_filled_slots(
    *,
    request: ReadObisSelectionRequest,
    boot: Any,
    started: datetime,
    slots: List[Optional[ObisSelectionRowResult]],
    wire_indices: List[int],
    assoc_ok: bool,
    envelope_transport_mode: str,
    tcp_endpoint: Optional[str],
    operator_cancel_message: Optional[str] = None,
) -> RuntimeResponseEnvelope:
    """Build envelope when slots are already filled (sequential job path)."""
    finished = datetime.now(timezone.utc)
    last_at = _iso_z(finished)
    items = request.selectedItems
    n = len(items)
    final_rows = [slots[i] for i in range(n)]  # type: ignore[list-item]

    if not assoc_ok:
        return _failure_envelope(
            meter_id=request.meterId,
            operation="readObisSelection",
            started=started,
            finished=finished,
            message="DLMS association failed before sequential OBIS reads.",
            code="ASSOCIATION_FAILED",
            transport_state="disconnected",
            association_state="failed",
            transport_attempted=True,
            association_attempted=True,
            verified=False,
            outcome="attempted_failed",
            detail_code="ASSOCIATION_FAILED",
            err_details={
                "transportMode": envelope_transport_mode,
                "tcpEndpoint": tcp_endpoint,
                "sequential": True,
            },
            payload=ReadObisSelectionPayload(rows=final_rows),
        )

    ok_wire = sum(
        1 for i in wire_indices if slots[i] is not None and slots[i].status == "ok"  # type: ignore[union-attr]
    )
    n_wire = len(wire_indices)
    verified = ok_wire > 0

    if operator_cancel_message:
        duration_ms = max(1, int((finished - started).total_seconds() * 1000))
        transport_extras: dict[str, Any] = {"transportMode": envelope_transport_mode, "sequential": True}
        if tcp_endpoint:
            transport_extras["tcpEndpoint"] = tcp_endpoint
        return RuntimeResponseEnvelope(
            ok=False,
            simulated=False,
            operation="readObisSelection",
            meterId=request.meterId,
            startedAt=_iso_z(started),
            finishedAt=last_at,
            durationMs=duration_ms,
            message=operator_cancel_message,
            transportState="disconnected",
            associationState="associated",
            payload=ReadObisSelectionPayload(rows=final_rows),
            error=RuntimeErrorInfo(
                code="OBIS_SELECTION_CANCELLED_BY_OPERATOR",
                message=operator_cancel_message,
                details=transport_extras,
            ),
            diagnostics=RuntimeExecutionDiagnostics(
                outcome="verified_on_wire_success" if verified else "attempted_failed",  # type: ignore[arg-type]
                capabilityStage="cosem_read",
                transportAttempted=True,
                associationAttempted=True,
                verifiedOnWire=verified,
                detailCode="OBIS_SELECTION_CANCELLED_BY_OPERATOR",
            ),
        )

    transport_extras = {"transportMode": envelope_transport_mode}
    if tcp_endpoint:
        transport_extras["tcpEndpoint"] = tcp_endpoint

    if n_wire > 0 and ok_wire == 0:
        return _failure_envelope(
            meter_id=request.meterId,
            operation="readObisSelection",
            started=started,
            finished=finished,
            message="All selected OBIS reads failed after successful association.",
            code="OBIS_SELECTION_ALL_FAILED",
            transport_state="disconnected",
            association_state="associated",
            transport_attempted=True,
            association_attempted=True,
            verified=False,
            outcome="attempted_failed",
            detail_code="OBIS_SELECTION_ALL_FAILED",
            err_details=transport_extras,
            payload=ReadObisSelectionPayload(rows=final_rows),
        )

    if n_wire == 0:
        duration_ms = max(1, int((finished - started).total_seconds() * 1000))
        return RuntimeResponseEnvelope(
            ok=True,
            simulated=False,
            operation="readObisSelection",
            meterId=request.meterId,
            startedAt=_iso_z(started),
            finishedAt=last_at,
            durationMs=duration_ms,
            message="No wire reads attempted — all rows unsupported in v1.",
            transportState="disconnected",
            associationState="none",
            payload=ReadObisSelectionPayload(rows=final_rows),
            error=None,
            diagnostics=RuntimeExecutionDiagnostics(
                outcome="attempted_failed",  # type: ignore[arg-type]
                capabilityStage="cosem_read",
                transportAttempted=False,
                associationAttempted=False,
                verifiedOnWire=False,
                detailCode="OBIS_SELECTION_ALL_UNSUPPORTED_V1",
            ),
        )

    partial = n_wire > 0 and ok_wire < n_wire

    if envelope_transport_mode == "tcp_inbound":
        detail = (
            "MVP_AMI_OBIS_SELECTION_PARTIAL_TCP_INBOUND"
            if partial
            else "MVP_AMI_OBIS_SELECTION_OK_TCP_INBOUND"
        )
        ep = tcp_endpoint or "?"
        msg = (
            f"OBIS selection (sequential, inbound {ep}): {ok_wire}/{n_wire} wire reads succeeded"
            + ("; see per-row status." if partial else ".")
        )
    elif envelope_transport_mode == "tcp_client":
        detail = (
            "MVP_AMI_OBIS_SELECTION_PARTIAL_TCP_CLIENT"
            if partial
            else "MVP_AMI_OBIS_SELECTION_OK_TCP_CLIENT"
        )
        msg = (
            f"OBIS selection (sequential, TCP client): {ok_wire}/{n_wire} wire reads succeeded"
            + ("; see per-row status." if partial else ".")
        )
    else:
        detail = "MVP_AMI_OBIS_SELECTION_PARTIAL" if partial else "MVP_AMI_OBIS_SELECTION_OK"
        port_ref = getattr(getattr(boot, "app_cfg", None), "serial", None)
        port_ref = getattr(port_ref, "port_primary", None) if port_ref else None
        msg = (
            f"OBIS selection (sequential, serial port={port_ref!r}): {ok_wire}/{n_wire} wire reads succeeded"
            + ("; see per-row status." if partial else ".")
        )

    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    out = "verified_on_wire_success" if verified else "attempted_failed"
    return RuntimeResponseEnvelope(
        ok=True,
        simulated=False,
        operation="readObisSelection",
        meterId=request.meterId,
        startedAt=_iso_z(started),
        finishedAt=last_at,
        durationMs=duration_ms,
        message=msg,
        transportState="disconnected",
        associationState="associated",
        payload=ReadObisSelectionPayload(rows=final_rows),
        error=None,
        diagnostics=RuntimeExecutionDiagnostics(
            outcome=out,  # type: ignore[arg-type]
            capabilityStage="cosem_read",
            transportAttempted=True,
            associationAttempted=True,
            verifiedOnWire=verified,
            detailCode=detail,
        ),
    )


def _finalize_obis_selection_from_meter_result(
    *,
    request: ReadObisSelectionRequest,
    boot: Any,
    started: datetime,
    result: Any,
    slots: List[Optional[ObisSelectionRowResult]],
    wire_indices: List[int],
    transport_layer: str,
    envelope_transport_mode: str,
    tcp_endpoint: Optional[str],
) -> RuntimeResponseEnvelope:
    finished = datetime.now(timezone.utc)
    last_at = _iso_z(finished)
    items = request.selectedItems
    n = len(items)
    diags = result.diagnostics or []

    early = _early_transport_failures(
        meter_id=request.meterId,
        operation="readObisSelection",
        started=started,
        finished=finished,
        diags=diags,
        transport_layer=transport_layer,
        envelope_transport_mode=envelope_transport_mode,
    )
    if early is not None:
        for i, item in enumerate(items):
            if slots[i] is None:
                msg = early.message
                if early.error and early.error.message:
                    msg = early.error.message
                slots[i] = ObisSelectionRowResult(
                    obis=item.obis,
                    status="error",
                    error=msg[:500],
                    packKey=item.packKey,
                    lastReadAt=last_at,
                )
        final_rows = [slots[i] for i in range(n)]  # type: ignore[list-item]
        return RuntimeResponseEnvelope(
            ok=False,
            simulated=False,
            operation="readObisSelection",
            meterId=request.meterId,
            startedAt=early.startedAt,
            finishedAt=early.finishedAt,
            durationMs=early.durationMs,
            message=early.message,
            transportState=early.transportState,
            associationState=early.associationState,
            payload=ReadObisSelectionPayload(rows=final_rows),
            error=early.error,
            diagnostics=early.diagnostics,
        )

    parsed = result.parsed_values or {}
    assoc_d = find_stage(diags, "association")
    assoc_ok = bool(assoc_d and assoc_d.success)

    ok_wire = 0
    for i in wire_indices:
        item = items[i]
        row = parsed.get(item.obis) or {}
        slots[i] = _obis_selection_row_from_parsed(item, row, last_at)
        if slots[i] is not None and slots[i].status == "ok":
            ok_wire += 1

    final_rows = [slots[i] for i in range(n)]  # type: ignore[list-item]
    n_wire = len(wire_indices)

    transport_extras: dict[str, Any] = {"transportMode": envelope_transport_mode}
    if tcp_endpoint:
        transport_extras["tcpEndpoint"] = tcp_endpoint

    if n_wire > 0 and ok_wire == 0:
        diag_dump = diagnostic_dump(diags)
        return _failure_envelope(
            meter_id=request.meterId,
            operation="readObisSelection",
            started=started,
            finished=finished,
            message="All selected OBIS reads failed after successful association.",
            code="OBIS_SELECTION_ALL_FAILED",
            transport_state="disconnected",
            association_state="associated",
            transport_attempted=True,
            association_attempted=True,
            verified=False,
            outcome="attempted_failed",
            detail_code="OBIS_SELECTION_ALL_FAILED",
            err_details={"mvpAmiDiagnostics": diag_dump, **transport_extras},
            payload=ReadObisSelectionPayload(rows=final_rows),
        )

    partial = n_wire > 0 and ok_wire < n_wire
    verified = ok_wire > 0 and assoc_ok

    if n_wire == 0:
        duration_ms = max(1, int((finished - started).total_seconds() * 1000))
        return RuntimeResponseEnvelope(
            ok=True,
            simulated=False,
            operation="readObisSelection",
            meterId=request.meterId,
            startedAt=_iso_z(started),
            finishedAt=last_at,
            durationMs=duration_ms,
            message="No wire reads attempted — all rows unsupported in v1 (Data/Clock/Register, attr 2).",
            transportState="disconnected",
            associationState="none",
            payload=ReadObisSelectionPayload(rows=final_rows),
            error=None,
            diagnostics=RuntimeExecutionDiagnostics(
                outcome="attempted_failed",  # type: ignore[arg-type]
                capabilityStage="cosem_read",
                transportAttempted=False,
                associationAttempted=False,
                verifiedOnWire=False,
                detailCode="OBIS_SELECTION_ALL_UNSUPPORTED_V1",
            ),
        )

    if envelope_transport_mode == "tcp_inbound":
        detail = (
            "MVP_AMI_OBIS_SELECTION_PARTIAL_TCP_INBOUND"
            if partial
            else "MVP_AMI_OBIS_SELECTION_OK_TCP_INBOUND"
        )
        ep = tcp_endpoint or "?"
        msg = (
            f"OBIS selection via MVP-AMI inbound TCP ({ep}): {ok_wire}/{n_wire} wire reads succeeded"
            + ("; see per-row status." if partial else ".")
        )
    elif envelope_transport_mode == "tcp_client":
        detail = (
            "MVP_AMI_OBIS_SELECTION_PARTIAL_TCP_CLIENT"
            if partial
            else "MVP_AMI_OBIS_SELECTION_OK_TCP_CLIENT"
        )
        msg = (
            f"OBIS selection via MVP-AMI TCP client ({tcp_endpoint!r}): {ok_wire}/{n_wire} wire reads succeeded"
            + ("; see per-row status." if partial else ".")
        )
    else:
        detail = "MVP_AMI_OBIS_SELECTION_PARTIAL" if partial else "MVP_AMI_OBIS_SELECTION_OK"
        port_ref = getattr(result, "port_used", None) or getattr(
            getattr(boot.app_cfg, "serial", None), "port_primary", None
        )
        msg = (
            f"OBIS selection via MVP-AMI serial (port={port_ref!r}): {ok_wire}/{n_wire} wire reads succeeded"
            + ("; see per-row status." if partial else ".")
        )

    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    out = "verified_on_wire_success" if verified else "attempted_failed"
    return RuntimeResponseEnvelope(
        ok=True,
        simulated=False,
        operation="readObisSelection",
        meterId=request.meterId,
        startedAt=_iso_z(started),
        finishedAt=last_at,
        durationMs=duration_ms,
        message=msg,
        transportState="disconnected",
        associationState="associated",
        payload=ReadObisSelectionPayload(rows=final_rows),
        error=None,
        diagnostics=RuntimeExecutionDiagnostics(
            outcome=out,  # type: ignore[arg-type]
            capabilityStage="cosem_read",
            transportAttempted=True,
            associationAttempted=True,
            verifiedOnWire=verified,
            detailCode=detail,
        ),
    )


def _read_identity_finish_phase1_result(
    *,
    request: ReadIdentityRequest,
    boot: Any,
    started: datetime,
    obis: str,
    result: Any,
    transport_kind: str,
    tcp_endpoint: Optional[str],
) -> RuntimeResponseEnvelope:
    """Common tail for serial `run_phase1` and TCP `run_phase1_tcp_socket` MeterResult."""
    finished = datetime.now(timezone.utc)
    diags = result.diagnostics or []
    transport_layer = "serial" if transport_kind == "serial" else "tcp"
    envelope_transport_mode = (
        "serial"
        if transport_kind == "serial"
        else ("tcp_inbound" if transport_kind == "tcp_listener" else "tcp_client")
    )
    early = _early_transport_failures(
        meter_id=request.meterId,
        operation="readIdentity",
        started=started,
        finished=finished,
        diags=diags,
        transport_layer=transport_layer,
        envelope_transport_mode=envelope_transport_mode,
    )
    if early is not None:
        return early

    read_d = find_stage(diags, "read_obis")
    diag_dump = diagnostic_dump(diags)
    assoc_d = find_stage(diags, "association")
    assoc_ok = bool(assoc_d and assoc_d.success)

    row = (result.parsed_values or {}).get(obis) or {}
    read_err = row.get("error")
    has_value = row.get("value") is not None or bool((row.get("value_str") or "").strip())
    read_ok = read_err is None and has_value

    id_err_extras: dict[str, Any] = {
        "obis": obis,
        "row": row,
        "mvpAmiDiagnostics": diag_dump,
        "readObis": getattr(read_d, "__dict__", {}) if read_d else None,
        "transportMode": envelope_transport_mode,
    }
    if tcp_endpoint:
        id_err_extras["tcpEndpoint"] = tcp_endpoint

    if not read_ok:
        return _failure_envelope(
            meter_id=request.meterId,
            operation="readIdentity",
            started=started,
            finished=finished,
            message=f"Identity OBIS read failed for {obis!r}: {read_err or 'no value'}",
            code="IDENTITY_READ_FAILED",
            transport_state="disconnected",
            association_state="associated",
            transport_attempted=True,
            association_attempted=True,
            verified=False,
            outcome="attempted_failed",
            detail_code="IDENTITY_OBIS_FAILED",
            err_details=id_err_extras,
        )

    payload = _identity_payload_from_obis_row(obis, row)
    verified = bool(assoc_ok and read_ok)
    port_ref = getattr(result, "port_used", None) or getattr(
        getattr(boot.app_cfg, "serial", None), "port_primary", None
    )
    if transport_kind in ("tcp_client", "tcp_listener") and tcp_endpoint:
        port_ref = tcp_endpoint

    if transport_kind == "tcp_client":
        msg = (
            f"Identity OBIS {obis} read via MVP-AMI TCP client path "
            f"(endpoint={tcp_endpoint!r}, verifiedOnWire={verified}). "
            "Outbound dial — secondary for modem-programmed server topology; prefer inbound listener when the modem connects to you."
        )
        detail = "MVP_AMI_IDENTITY_OK_TCP_CLIENT"
    elif transport_kind == "tcp_listener":
        msg = (
            f"Identity OBIS {obis} read via MVP-AMI staged inbound TCP listener "
            f"(modem {tcp_endpoint!r}, verifiedOnWire={verified}). "
            "Modem-initiated TCP to this server — experimental; serial remains the proven baseline."
        )
        detail = "MVP_AMI_IDENTITY_OK_TCP_INBOUND"
    else:
        msg = (
            f"Identity OBIS {obis} read via MVP-AMI serial path "
            f"(port={port_ref!r}, verifiedOnWire={verified})."
        )
        detail = "MVP_AMI_IDENTITY_OK"

    return _success_envelope(
        meter_id=request.meterId,
        operation="readIdentity",
        started=started,
        finished=finished,
        payload=payload,
        message=msg,
        transport_attempted=True,
        association_attempted=True,
        verified=verified,
        detail_code=detail,
    )


def _read_basic_registers_finish_from_meter_result(
    *,
    request: ReadBasicRegistersRequest,
    boot: Any,
    started: datetime,
    result: Any,
    obis_list: List[str],
    transport_layer: str,
    envelope_transport_mode: str,
    tcp_endpoint: Optional[str],
) -> RuntimeResponseEnvelope:
    """Map MeterResult → envelope for serial or inbound TCP basic-registers (shared partial-success rules)."""
    finished = datetime.now(timezone.utc)
    diags = result.diagnostics or []
    early = _early_transport_failures(
        meter_id=request.meterId,
        operation="readBasicRegisters",
        started=started,
        finished=finished,
        diags=diags,
        transport_layer=transport_layer,
        envelope_transport_mode=envelope_transport_mode,
    )
    if early is not None:
        return early

    read_d = find_stage(diags, "read_obis")
    diag_dump = diagnostic_dump(diags)
    parsed = result.parsed_values or {}

    registers: dict[str, BasicRegisterReading] = {}
    ok_count = 0
    for obis in obis_list:
        row = parsed.get(obis) or {}
        ok, reading = _register_reading_from_row(row if isinstance(row, dict) else {})
        registers[obis] = reading
        if ok:
            ok_count += 1

    port_ref = getattr(result, "port_used", None) or getattr(
        getattr(boot.app_cfg, "serial", None), "port_primary", None
    )
    if envelope_transport_mode == "tcp_inbound" and tcp_endpoint:
        port_ref = tcp_endpoint

    transport_extras: dict[str, Any] = {"transportMode": envelope_transport_mode}
    if tcp_endpoint:
        transport_extras["tcpEndpoint"] = tcp_endpoint

    if ok_count == 0:
        return _failure_envelope(
            meter_id=request.meterId,
            operation="readBasicRegisters",
            started=started,
            finished=finished,
            message="All configured basic-register OBIS reads failed after successful association.",
            code="BASIC_REGISTERS_ALL_FAILED",
            transport_state="disconnected",
            association_state="associated",
            transport_attempted=True,
            association_attempted=True,
            verified=False,
            outcome="attempted_failed",
            detail_code="BASIC_REGISTERS_ALL_FAILED",
            err_details={
                "obisList": obis_list,
                "registers": {k: v.model_dump() for k, v in registers.items()},
                "mvpAmiDiagnostics": diag_dump,
                "readObis": getattr(read_d, "__dict__", {}) if read_d else None,
                **transport_extras,
            },
        )

    partial = ok_count < len(obis_list)
    verified = ok_count > 0
    if envelope_transport_mode == "tcp_inbound":
        detail = (
            "MVP_AMI_BASIC_REGISTERS_PARTIAL_TCP_INBOUND"
            if partial
            else "MVP_AMI_BASIC_REGISTERS_OK_TCP_INBOUND"
        )
        msg = (
            f"Basic registers via MVP-AMI inbound TCP listener (modem {tcp_endpoint!r}): "
            f"{ok_count}/{len(obis_list)} OBIS succeeded"
            + ("; see per-OBIS `error` fields in payload for failures." if partial else ".")
        )
    else:
        detail = "MVP_AMI_BASIC_REGISTERS_PARTIAL" if partial else "MVP_AMI_BASIC_REGISTERS_OK"
        msg = (
            f"Basic registers via MVP-AMI serial (port={port_ref!r}): "
            f"{ok_count}/{len(obis_list)} OBIS succeeded"
            + ("; see per-OBIS `error` fields in payload for failures." if partial else ".")
        )

    return _success_envelope(
        meter_id=request.meterId,
        operation="readBasicRegisters",
        started=started,
        finished=finished,
        payload=BasicRegistersPayload(registers=registers),
        message=msg,
        transport_attempted=True,
        association_attempted=True,
        verified=verified,
        detail_code=detail,
        outcome_override="verified_on_wire_success" if verified else "attempted_failed",
    )


class MvpAmiRuntimeAdapter(ProtocolRuntimeAdapter):
    def read_identity(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, request.channel)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details=boot.details,
            )

        obis = settings.identity_obis.strip() or "0.0.96.1.1.255"

        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_meter_client_construct_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
                started=started,
                finished=finished,
                message=f"MVP-AMI MeterClient construct failed: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc)},
            )

        if channel_spec_is_tcp(request.channel):
            ch = request.channel
            assert ch is not None
            host = (ch.host or "").strip()
            port = ch.port
            if not host or port is None or int(port) <= 0 or int(port) > 65535:
                finished = datetime.now(timezone.utc)
                return _failure_envelope(
                    meter_id=request.meterId,
                    operation="readIdentity",
                    started=started,
                    finished=finished,
                    message="TCP client channel requires channel.host and channel.port (1-65535).",
                    code="CHANNEL_TCP_INVALID",
                    transport_state="disconnected",
                    association_state="none",
                    transport_attempted=False,
                    association_attempted=False,
                    verified=False,
                    outcome="attempted_failed",
                    detail_code="CHANNEL_TCP_INVALID",
                    err_details={
                        "transportMode": "tcp_client",
                        "host": host or None,
                        "port": port,
                    },
                )

            run_tcp = getattr(client, "run_phase1_tcp_socket", None)
            if run_tcp is None:
                finished = datetime.now(timezone.utc)
                return _failure_envelope(
                    meter_id=request.meterId,
                    operation="readIdentity",
                    started=started,
                    finished=finished,
                    message=(
                        "MVP-AMI MeterClient has no run_phase1_tcp_socket — "
                        "update MVP-AMI checkout (TCP client path requires it)."
                    ),
                    code="MVP_AMI_TCP_SOCKET_API_MISSING",
                    transport_state="disconnected",
                    association_state="none",
                    transport_attempted=False,
                    association_attempted=False,
                    verified=False,
                    outcome="attempted_failed",
                    detail_code="MVP_AMI_TCP_SOCKET_API_MISSING",
                    err_details={"transportMode": "tcp_client", "mvpAmiRoot": boot.root},
                )

            timeout = float(
                ch.connectTimeoutSeconds
                if ch.connectTimeoutSeconds is not None
                else settings.tcp_client_connect_timeout_seconds
            )
            endpoint = f"{host}:{int(port)}"
            sock: Optional[socket.socket] = None
            try:
                sock = socket.create_connection((host, int(port)), timeout=timeout)
            except Exception as exc:  # noqa: BLE001
                log.warning("tcp_client_connect_failed", extra={"host": host, "port": port, "error": str(exc)})
                finished = datetime.now(timezone.utc)
                return _failure_envelope(
                    meter_id=request.meterId,
                    operation="readIdentity",
                    started=started,
                    finished=finished,
                    message=f"TCP connect to {endpoint} failed: {exc}",
                    code="TCP_CONNECT_FAILED",
                    transport_state="error",
                    association_state="none",
                    transport_attempted=True,
                    association_attempted=False,
                    verified=False,
                    outcome="attempted_failed",
                    detail_code="TCP_CONNECT_FAILED",
                    err_details={
                        "transportMode": "tcp_client",
                        "tcpEndpoint": endpoint,
                        "connectTimeoutSeconds": timeout,
                        "error": str(exc),
                    },
                )

            try:
                result = run_tcp(sock, obis_list=[obis])
            except Exception as exc:  # noqa: BLE001
                log.exception("mvp_ami_run_phase1_tcp_socket_failed")
                finished = datetime.now(timezone.utc)
                return _failure_envelope(
                    meter_id=request.meterId,
                    operation="readIdentity",
                    started=started,
                    finished=finished,
                    message=f"MVP-AMI run_phase1_tcp_socket raised: {exc}",
                    code="MVP_AMI_TCP_RUNTIME_ERROR",
                    transport_state="error",
                    association_state="failed",
                    transport_attempted=True,
                    association_attempted=True,
                    verified=False,
                    outcome="attempted_failed",
                    detail_code="MVP_AMI_TCP_RUNTIME_ERROR",
                    err_details={
                        "error": str(exc),
                        "transportMode": "tcp_client",
                        "tcpEndpoint": endpoint,
                    },
                )
            finally:
                try:
                    if sock is not None:
                        sock.close()
                except Exception:  # noqa: BLE001
                    pass

            return _read_identity_finish_phase1_result(
                request=request,
                boot=boot,
                started=started,
                obis=obis,
                result=result,
                transport_kind="tcp_client",
                tcp_endpoint=endpoint,
            )

        try:
            result = client.run_phase1(obis_list=[obis])
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_run_phase1_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
                started=started,
                finished=finished,
                message=f"MVP-AMI run_phase1 raised: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="failed",
                transport_attempted=True,
                association_attempted=True,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc), "transportMode": "serial"},
            )

        return _read_identity_finish_phase1_result(
            request=request,
            boot=boot,
            started=started,
            obis=obis,
            result=result,
            transport_kind="serial",
            tcp_endpoint=None,
        )

    def read_identity_on_accepted_tcp_socket(
        self,
        request: ReadIdentityRequest,
        sock: socket.socket,
        remote_endpoint: str,
    ) -> RuntimeResponseEnvelope:
        """
        Run MVP-AMI `run_phase1_tcp_socket` on an already-accepted inbound modem socket.
        Caller owns the socket and should close it after this returns.
        """
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, None)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details={**(boot.details or {}), "transportMode": "tcp_inbound"},
            )

        obis = settings.identity_obis.strip() or "0.0.96.1.1.255"
        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_meter_client_construct_failed_tcp_inbound")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
                started=started,
                finished=finished,
                message=f"MVP-AMI MeterClient construct failed: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc), "transportMode": "tcp_inbound"},
            )

        run_tcp = getattr(client, "run_phase1_tcp_socket", None)
        if run_tcp is None:
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
                started=started,
                finished=finished,
                message=(
                    "MVP-AMI MeterClient has no run_phase1_tcp_socket — "
                    "update MVP-AMI checkout (inbound TCP path requires it)."
                ),
                code="MVP_AMI_TCP_SOCKET_API_MISSING",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_TCP_SOCKET_API_MISSING",
                err_details={"transportMode": "tcp_inbound", "mvpAmiRoot": boot.root},
            )

        try:
            result = run_tcp(sock, obis_list=[obis])
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_run_phase1_tcp_socket_inbound_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
                started=started,
                finished=finished,
                message=f"MVP-AMI run_phase1_tcp_socket (inbound) raised: {exc}",
                code="MVP_AMI_TCP_RUNTIME_ERROR",
                transport_state="error",
                association_state="failed",
                transport_attempted=True,
                association_attempted=True,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_TCP_RUNTIME_ERROR",
                err_details={
                    "error": str(exc),
                    "transportMode": "tcp_inbound",
                    "tcpEndpoint": remote_endpoint,
                },
            )

        return _read_identity_finish_phase1_result(
            request=request,
            boot=boot,
            started=started,
            obis=obis,
            result=result,
            transport_kind="tcp_listener",
            tcp_endpoint=remote_endpoint,
        )

    def read_basic_registers_on_accepted_tcp_socket(
        self,
        request: ReadBasicRegistersRequest,
        sock: socket.socket,
        remote_endpoint: str,
    ) -> RuntimeResponseEnvelope:
        """
        Multi-OBIS basic registers via `run_phase1_tcp_socket` on an inbound staged modem connection.
        Caller owns the socket and should close it after this returns.
        """
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, None)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details={**(boot.details or {}), "transportMode": "tcp_inbound"},
            )

        obis_list = _obis_list_from_settings(settings.basic_registers_obis)
        if not obis_list:
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message="No OBIS configured for basic registers (SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS).",
                code="BASIC_REGISTERS_OBIS_EMPTY",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="BASIC_REGISTERS_OBIS_EMPTY",
                err_details={"transportMode": "tcp_inbound"},
            )

        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_meter_client_construct_failed_tcp_inbound_basic")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message=f"MVP-AMI MeterClient construct failed: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc), "transportMode": "tcp_inbound"},
            )

        run_tcp = getattr(client, "run_phase1_tcp_socket", None)
        if run_tcp is None:
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message=(
                    "MVP-AMI MeterClient has no run_phase1_tcp_socket — "
                    "update MVP-AMI checkout (inbound TCP path requires it)."
                ),
                code="MVP_AMI_TCP_SOCKET_API_MISSING",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_TCP_SOCKET_API_MISSING",
                err_details={"transportMode": "tcp_inbound", "mvpAmiRoot": boot.root},
            )

        try:
            result = run_tcp(sock, obis_list=obis_list)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_run_phase1_tcp_socket_inbound_basic_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message=f"MVP-AMI run_phase1_tcp_socket (inbound basic registers) raised: {exc}",
                code="MVP_AMI_TCP_RUNTIME_ERROR",
                transport_state="error",
                association_state="failed",
                transport_attempted=True,
                association_attempted=True,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_TCP_RUNTIME_ERROR",
                err_details={
                    "error": str(exc),
                    "transportMode": "tcp_inbound",
                    "tcpEndpoint": remote_endpoint,
                    "obisList": obis_list,
                },
            )

        return _read_basic_registers_finish_from_meter_result(
            request=request,
            boot=boot,
            started=started,
            result=result,
            obis_list=obis_list,
            transport_layer="tcp",
            envelope_transport_mode="tcp_inbound",
            tcp_endpoint=remote_endpoint,
        )

    def read_basic_registers(self, request: ReadBasicRegistersRequest) -> RuntimeResponseEnvelope:
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, request.channel)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details=boot.details,
            )

        obis_list = _obis_list_from_settings(settings.basic_registers_obis)
        if not obis_list:
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message="No OBIS configured for basic registers (SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS).",
                code="BASIC_REGISTERS_OBIS_EMPTY",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="BASIC_REGISTERS_OBIS_EMPTY",
            )

        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
            result = client.run_phase1(obis_list=obis_list)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_run_phase1_basic_registers_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message=f"MVP-AMI run_phase1 raised: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="failed",
                transport_attempted=True,
                association_attempted=True,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc)},
            )

        return _read_basic_registers_finish_from_meter_result(
            request=request,
            boot=boot,
            started=started,
            result=result,
            obis_list=obis_list,
            transport_layer="serial",
            envelope_transport_mode="serial",
            tcp_endpoint=None,
        )

    def read_obis_selection(self, request: ReadObisSelectionRequest) -> RuntimeResponseEnvelope:
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, request.channel)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readObisSelection",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details=boot.details,
            )

        slots, wire_unique, wire_indices = _prepare_obis_selection_slots(request)
        if not wire_unique:
            finished = datetime.now(timezone.utc)
            n = len(request.selectedItems)
            final_rows = [slots[i] for i in range(n)]  # type: ignore[list-item]
            duration_ms = max(1, int((finished - started).total_seconds() * 1000))
            return RuntimeResponseEnvelope(
                ok=True,
                simulated=False,
                operation="readObisSelection",
                meterId=request.meterId,
                startedAt=_iso_z(started),
                finishedAt=_iso_z(finished),
                durationMs=duration_ms,
                message="No wire reads attempted — all rows unsupported in v1 (Data/Clock/Register, attr 2).",
                transportState="disconnected",
                associationState="none",
                payload=ReadObisSelectionPayload(rows=final_rows),
                error=None,
                diagnostics=RuntimeExecutionDiagnostics(
                    outcome="attempted_failed",  # type: ignore[arg-type]
                    capabilityStage="cosem_read",
                    transportAttempted=False,
                    associationAttempted=False,
                    verifiedOnWire=False,
                    detailCode="OBIS_SELECTION_ALL_UNSUPPORTED_V1",
                ),
            )

        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_meter_client_construct_failed_obis_selection")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readObisSelection",
                started=started,
                finished=finished,
                message=f"MVP-AMI MeterClient construct failed: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc)},
            )

        if channel_spec_is_tcp(request.channel):
            ch = request.channel
            assert ch is not None
            host = (ch.host or "").strip()
            port = ch.port
            if not host or port is None or int(port) <= 0 or int(port) > 65535:
                finished = datetime.now(timezone.utc)
                return _failure_envelope(
                    meter_id=request.meterId,
                    operation="readObisSelection",
                    started=started,
                    finished=finished,
                    message="TCP client channel requires channel.host and channel.port (1-65535).",
                    code="CHANNEL_TCP_INVALID",
                    transport_state="disconnected",
                    association_state="none",
                    transport_attempted=False,
                    association_attempted=False,
                    verified=False,
                    outcome="attempted_failed",
                    detail_code="CHANNEL_TCP_INVALID",
                    err_details={
                        "transportMode": "tcp_client",
                        "host": host or None,
                        "port": port,
                    },
                )

            run_tcp = getattr(client, "run_phase1_tcp_socket", None)
            if run_tcp is None:
                finished = datetime.now(timezone.utc)
                return _failure_envelope(
                    meter_id=request.meterId,
                    operation="readObisSelection",
                    started=started,
                    finished=finished,
                    message=(
                        "MVP-AMI MeterClient has no run_phase1_tcp_socket — "
                        "update MVP-AMI checkout (TCP client path requires it)."
                    ),
                    code="MVP_AMI_TCP_SOCKET_API_MISSING",
                    transport_state="disconnected",
                    association_state="none",
                    transport_attempted=False,
                    association_attempted=False,
                    verified=False,
                    outcome="attempted_failed",
                    detail_code="MVP_AMI_TCP_SOCKET_API_MISSING",
                    err_details={"transportMode": "tcp_client", "mvpAmiRoot": boot.root},
                )

            timeout = float(
                ch.connectTimeoutSeconds
                if ch.connectTimeoutSeconds is not None
                else settings.tcp_client_connect_timeout_seconds
            )
            endpoint = f"{host}:{int(port)}"
            sock: Optional[socket.socket] = None
            try:
                sock = socket.create_connection((host, int(port)), timeout=timeout)
            except Exception as exc:  # noqa: BLE001
                log.warning("tcp_client_connect_failed_obis", extra={"host": host, "port": port, "error": str(exc)})
                finished = datetime.now(timezone.utc)
                return _failure_envelope(
                    meter_id=request.meterId,
                    operation="readObisSelection",
                    started=started,
                    finished=finished,
                    message=f"TCP connect to {endpoint} failed: {exc}",
                    code="TCP_CONNECT_FAILED",
                    transport_state="error",
                    association_state="none",
                    transport_attempted=True,
                    association_attempted=False,
                    verified=False,
                    outcome="attempted_failed",
                    detail_code="TCP_CONNECT_FAILED",
                    err_details={
                        "transportMode": "tcp_client",
                        "tcpEndpoint": endpoint,
                        "connectTimeoutSeconds": timeout,
                        "error": str(exc),
                    },
                )

            try:
                result = run_tcp(sock, obis_list=wire_unique)
            except Exception as exc:  # noqa: BLE001
                log.exception("mvp_ami_run_phase1_tcp_socket_obis_selection_failed")
                finished = datetime.now(timezone.utc)
                return _failure_envelope(
                    meter_id=request.meterId,
                    operation="readObisSelection",
                    started=started,
                    finished=finished,
                    message=f"MVP-AMI run_phase1_tcp_socket raised: {exc}",
                    code="MVP_AMI_TCP_RUNTIME_ERROR",
                    transport_state="error",
                    association_state="failed",
                    transport_attempted=True,
                    association_attempted=True,
                    verified=False,
                    outcome="attempted_failed",
                    detail_code="MVP_AMI_TCP_RUNTIME_ERROR",
                    err_details={
                        "error": str(exc),
                        "transportMode": "tcp_client",
                        "tcpEndpoint": endpoint,
                    },
                )
            finally:
                try:
                    if sock is not None:
                        sock.close()
                except Exception:  # noqa: BLE001
                    pass

            return _finalize_obis_selection_from_meter_result(
                request=request,
                boot=boot,
                started=started,
                result=result,
                slots=slots,
                wire_indices=wire_indices,
                transport_layer="tcp",
                envelope_transport_mode="tcp_client",
                tcp_endpoint=endpoint,
            )

        try:
            result = client.run_phase1(obis_list=wire_unique)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_run_phase1_obis_selection_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readObisSelection",
                started=started,
                finished=finished,
                message=f"MVP-AMI run_phase1 raised: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="failed",
                transport_attempted=True,
                association_attempted=True,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc)},
            )

        return _finalize_obis_selection_from_meter_result(
            request=request,
            boot=boot,
            started=started,
            result=result,
            slots=slots,
            wire_indices=wire_indices,
            transport_layer="serial",
            envelope_transport_mode="serial",
            tcp_endpoint=None,
        )

    def read_obis_selection_inbound_tcp_sequential(
        self,
        request: ReadObisSelectionRequest,
        sock: socket.socket,
        remote_endpoint: str,
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        job_id: Optional[str] = None,
    ) -> RuntimeResponseEnvelope:
        """
        One IEC + association, then each OBIS read separately (for job progress / long selections).
        """
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, None)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readObisSelection",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details={**(boot.details or {}), "transportMode": "tcp_inbound", "sequential": True},
            )

        slots, wire_unique, wire_indices = _prepare_obis_selection_slots(request)
        if not wire_unique:
            finished = datetime.now(timezone.utc)
            n = len(request.selectedItems)
            final_rows = [slots[i] for i in range(n)]  # type: ignore[list-item]
            duration_ms = max(1, int((finished - started).total_seconds() * 1000))
            return RuntimeResponseEnvelope(
                ok=True,
                simulated=False,
                operation="readObisSelection",
                meterId=request.meterId,
                startedAt=_iso_z(started),
                finishedAt=_iso_z(finished),
                durationMs=duration_ms,
                message="No wire reads attempted — all rows unsupported in v1 (Data/Clock/Register, attr 2).",
                transportState="disconnected",
                associationState="none",
                payload=ReadObisSelectionPayload(rows=final_rows),
                error=None,
                diagnostics=RuntimeExecutionDiagnostics(
                    outcome="attempted_failed",  # type: ignore[arg-type]
                    capabilityStage="cosem_read",
                    transportAttempted=False,
                    associationAttempted=False,
                    verifiedOnWire=False,
                    detailCode="OBIS_SELECTION_ALL_UNSUPPORTED_V1",
                ),
            )

        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_meter_client_construct_failed_tcp_inbound_obis_seq")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readObisSelection",
                started=started,
                finished=finished,
                message=f"MVP-AMI MeterClient construct failed: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc), "transportMode": "tcp_inbound", "sequential": True},
            )

        transport, gx, errc = _tcp_assoc(client, sock)
        if errc:
            last_at = _iso_z(datetime.now(timezone.utc))
            for wi in wire_indices:
                it = request.selectedItems[wi]
                slots[wi] = ObisSelectionRowResult(
                    obis=it.obis,
                    value="",
                    status="error",
                    error=f"Association failed: {errc}",
                    packKey=it.packKey,
                    lastReadAt=last_at,
                )
            try:
                if gx is not None:
                    client._try_gurux_disconnect(transport, gx)
            except Exception:  # noqa: BLE001
                pass
            return _finalize_obis_selection_filled_slots(
                request=request,
                boot=boot,
                started=started,
                slots=slots,
                wire_indices=wire_indices,
                assoc_ok=False,
                envelope_transport_mode="tcp_inbound",
                tcp_endpoint=remote_endpoint,
            )

        from app.jobs import obis_selection_job_store as _obis_job_store

        abort_check: Optional[Callable[[], Optional[str]]] = None
        skip_check: Optional[Callable[[int], bool]] = None
        if job_id:

            def _abort() -> Optional[str]:
                return _CANCEL_BATCH_REASON if _obis_job_store.cancel_requested(job_id) else None

            def _skip(wi: int) -> bool:
                return _obis_job_store.is_wire_index_skipped(job_id, wi)

            abort_check = _abort
            skip_check = _skip

        session_pair: List[Any] = [transport, gx]

        def _refresh_inbound_session() -> Tuple[Any, Any, Optional[str]]:
            try:
                if session_pair[1] is not None:
                    client._try_gurux_disconnect(session_pair[0], session_pair[1])
            except Exception:  # noqa: BLE001
                pass
            if INBOUND_OBIS_INTER_CHUNK_SLEEP_SEC > 0:
                time.sleep(INBOUND_OBIS_INTER_CHUNK_SLEEP_SEC)
            t, g, err = _tcp_assoc(client, sock)
            session_pair[0] = t
            session_pair[1] = g
            return t, g, err

        total_w = len(wire_indices)
        done_global = 0
        fatal_loop: Optional[str] = None
        cs = INBOUND_OBIS_WIRE_CHUNK_SIZE
        for chunk_start in range(0, total_w, cs):
            chunk = wire_indices[chunk_start : chunk_start + cs]
            if chunk_start > 0 and any(slots[wi] is None for wi in chunk):
                _t, _g, rerr = _refresh_inbound_session()
                if rerr:
                    first_open: Optional[int] = None
                    for wi in wire_indices:
                        if slots[wi] is None:
                            first_open = wi
                            break
                    if first_open is not None:
                        done_global = _mark_wire_forward_from_index(
                            slots,
                            request.selectedItems,
                            wire_indices,
                            first_open,
                            f"Session refresh failed between OBIS chunks: {rerr}",
                            "not_attempted",
                            progress_callback,
                            done_global,
                            total_w,
                        )
                    break
            fatal_loop, done_global = _sequential_obis_wire_loop(
                client,
                session_pair[0],
                request,
                slots,
                wire_indices,
                progress_callback,
                abort_check=abort_check,
                skip_check=skip_check,
                total_wire_global=total_w,
                completed_wire_base=done_global,
                chunk_indices=chunk,
                session_pair=session_pair,
                refresh_session=_refresh_inbound_session,
            )
            if fatal_loop:
                break

        transport, gx = session_pair[0], session_pair[1]

        try:
            if gx is not None:
                client._try_gurux_disconnect(transport, gx)
        except Exception:  # noqa: BLE001
            pass

        op_cancel: Optional[str] = None
        if job_id and _obis_job_store.cancel_requested(job_id):
            op_cancel = _CANCEL_BATCH_REASON

        return _finalize_obis_selection_filled_slots(
            request=request,
            boot=boot,
            started=started,
            slots=slots,
            wire_indices=wire_indices,
            assoc_ok=True,
            envelope_transport_mode="tcp_inbound",
            tcp_endpoint=remote_endpoint,
            operator_cancel_message=op_cancel,
        )

    def read_obis_selection_on_accepted_tcp_socket(
        self,
        request: ReadObisSelectionRequest,
        sock: socket.socket,
        remote_endpoint: str,
    ) -> RuntimeResponseEnvelope:
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, None)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readObisSelection",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details={**(boot.details or {}), "transportMode": "tcp_inbound"},
            )

        slots, wire_unique, wire_indices = _prepare_obis_selection_slots(request)
        if not wire_unique:
            finished = datetime.now(timezone.utc)
            n = len(request.selectedItems)
            final_rows = [slots[i] for i in range(n)]  # type: ignore[list-item]
            duration_ms = max(1, int((finished - started).total_seconds() * 1000))
            return RuntimeResponseEnvelope(
                ok=True,
                simulated=False,
                operation="readObisSelection",
                meterId=request.meterId,
                startedAt=_iso_z(started),
                finishedAt=_iso_z(finished),
                durationMs=duration_ms,
                message="No wire reads attempted — all rows unsupported in v1 (Data/Clock/Register, attr 2).",
                transportState="disconnected",
                associationState="none",
                payload=ReadObisSelectionPayload(rows=final_rows),
                error=None,
                diagnostics=RuntimeExecutionDiagnostics(
                    outcome="attempted_failed",  # type: ignore[arg-type]
                    capabilityStage="cosem_read",
                    transportAttempted=False,
                    associationAttempted=False,
                    verifiedOnWire=False,
                    detailCode="OBIS_SELECTION_ALL_UNSUPPORTED_V1",
                ),
            )

        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_meter_client_construct_failed_tcp_inbound_obis")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readObisSelection",
                started=started,
                finished=finished,
                message=f"MVP-AMI MeterClient construct failed: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc), "transportMode": "tcp_inbound"},
            )

        run_tcp = getattr(client, "run_phase1_tcp_socket", None)
        if run_tcp is None:
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readObisSelection",
                started=started,
                finished=finished,
                message=(
                    "MVP-AMI MeterClient has no run_phase1_tcp_socket — "
                    "update MVP-AMI checkout (inbound TCP path requires it)."
                ),
                code="MVP_AMI_TCP_SOCKET_API_MISSING",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_TCP_SOCKET_API_MISSING",
                err_details={"transportMode": "tcp_inbound", "mvpAmiRoot": boot.root},
            )

        try:
            result = run_tcp(sock, obis_list=wire_unique)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_run_phase1_tcp_socket_inbound_obis_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readObisSelection",
                started=started,
                finished=finished,
                message=f"MVP-AMI run_phase1_tcp_socket (inbound OBIS selection) raised: {exc}",
                code="MVP_AMI_TCP_RUNTIME_ERROR",
                transport_state="error",
                association_state="failed",
                transport_attempted=True,
                association_attempted=True,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_TCP_RUNTIME_ERROR",
                err_details={
                    "error": str(exc),
                    "transportMode": "tcp_inbound",
                    "tcpEndpoint": remote_endpoint,
                    "obisList": wire_unique,
                },
            )

        return _finalize_obis_selection_from_meter_result(
            request=request,
            boot=boot,
            started=started,
            result=result,
            slots=slots,
            wire_indices=wire_indices,
            transport_layer="tcp",
            envelope_transport_mode="tcp_inbound",
            tcp_endpoint=remote_endpoint,
        )

    def discover_supported_obis(self, request: DiscoverSupportedObisRequest) -> RuntimeResponseEnvelope:
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, request.channel)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="discoverSupportedObis",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details=boot.details,
                capability_stage="object_discovery",
            )

        assoc_ln = (settings.discovery_association_ln or "").strip() or "0.0.40.0.0.255"
        disc = run_association_view_discovery(settings, request.channel, boot.meter_mod, assoc_ln)
        finished = datetime.now(timezone.utc)

        if not disc.ok:
            transport_attempted = any(d.get("stage") == "open_port" and d.get("success") for d in disc.diagnostics)
            assoc_attempted = any(d.get("stage") == "association" for d in disc.diagnostics)
            ec = disc.error_code or "DISCOVERY_FAILED"
            if ec == "ASSOCIATION_VIEW_READ_FAILED":
                assoc_state = "associated"
            elif ec in ("SERIAL_OPEN_FAILED", "IEC_HANDSHAKE_FAILED", "MVP_AMI_ROOT_REQUIRED"):
                assoc_state = "none"
            else:
                assoc_state = "failed"
            return _failure_envelope(
                meter_id=request.meterId,
                operation="discoverSupportedObis",
                started=started,
                finished=finished,
                message=disc.error_message or "Association view discovery failed.",
                code=ec,
                transport_state="error" if disc.error_code == "SERIAL_OPEN_FAILED" else "disconnected",
                association_state=assoc_state,  # type: ignore[arg-type]
                transport_attempted=transport_attempted,
                association_attempted=assoc_attempted,
                verified=False,
                outcome="attempted_failed",
                detail_code=disc.error_code or "DISCOVERY_FAILED",
                err_details={
                    "sunDiscoveryDiagnostics": disc.diagnostics,
                    "guruxFrameCount": len(disc.gurux_frames_extra),
                    "associationLogicalName": assoc_ln,
                    "associationViewInstrumentation": (
                        disc.instrumentation.model_dump(mode="json")
                        if disc.instrumentation is not None
                        else None
                    ),
                },
                capability_stage="object_discovery",
            )

        rows: List[DiscoveredObjectRow] = []
        for o in disc.objects:
            try:
                rows.append(DiscoveredObjectRow.model_validate(o))
            except Exception:  # noqa: BLE001
                rows.append(
                    DiscoveredObjectRow(
                        classId=int(o.get("classId", -1)) if isinstance(o, dict) else -1,
                        obis=str(o.get("obis", "")) if isinstance(o, dict) else "",
                        version=int(o.get("version", 0)) if isinstance(o, dict) else 0,
                        error="row_validate_failed",
                    )
                )

        payload = DiscoverSupportedObisPayload(
            associationLogicalName=assoc_ln,
            totalCount=len(rows),
            objects=rows,
            associationViewInstrumentation=disc.instrumentation,
            catalogIntegrityNote=_catalog_integrity_note(disc.instrumentation, len(rows)),
        )
        port_ref = disc.port_used
        verified = True
        disc_detail = (
            "MVP_AMI_DISCOVERY_OK_EMPTY_OBJECT_LIST"
            if len(rows) == 0
            else "MVP_AMI_DISCOVERY_OK"
        )
        msg = (
            f"Association object list read via Gurux (LN={assoc_ln!r}, port={port_ref!r}, "
            f"objects={len(rows)}, verifiedOnWire=True)."
        )
        if len(rows) == 0:
            msg += (
                " Raw objectList length/normalization details are in payload.associationViewInstrumentation "
                "and payload.catalogIntegrityNote — ok=true means the read completed, not that the catalog is non-empty."
            )
        return _success_envelope(
            meter_id=request.meterId,
            operation="discoverSupportedObis",
            started=started,
            finished=finished,
            payload=payload,
            message=msg,
            transport_attempted=True,
            association_attempted=True,
            verified=verified,
            detail_code=disc_detail,
            capability_stage="object_discovery",
        )

    def relay_read_status(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        from app.adapters.mvp_ami_relay_impl import relay_read_status as _impl

        return _impl(request)

    def relay_disconnect(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        from app.adapters.mvp_ami_relay_impl import relay_disconnect as _impl

        return _impl(request)

    def relay_reconnect(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        from app.adapters.mvp_ami_relay_impl import relay_reconnect as _impl

        return _impl(request)

    def relay_read_status_on_accepted_tcp_socket(
        self,
        request: ReadIdentityRequest,
        sock: socket.socket,
        remote_endpoint: str,
    ) -> RuntimeResponseEnvelope:
        from app.adapters.mvp_ami_relay_impl import relay_read_status_inbound as _impl

        return _impl(request, sock, remote_endpoint)

    def relay_disconnect_on_accepted_tcp_socket(
        self,
        request: ReadIdentityRequest,
        sock: socket.socket,
        remote_endpoint: str,
    ) -> RuntimeResponseEnvelope:
        from app.adapters.mvp_ami_relay_impl import relay_disconnect_inbound as _impl

        return _impl(request, sock, remote_endpoint)

    def relay_reconnect_on_accepted_tcp_socket(
        self,
        request: ReadIdentityRequest,
        sock: socket.socket,
        remote_endpoint: str,
    ) -> RuntimeResponseEnvelope:
        from app.adapters.mvp_ami_relay_impl import relay_reconnect_inbound as _impl

        return _impl(request, sock, remote_endpoint)
