"""Background job: sequential read-obis-selection across multiple staged inbound TCP sockets (one chunk per connection)."""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

from app.adapters.factory import get_runtime_adapter
from app.adapters.mvp_ami_adapter import (
    INBOUND_JOB_SEGMENT_ASSOC_FAILED,
    MvpAmiRuntimeAdapter,
    _CANCEL_BATCH_REASON,
    _finalize_obis_selection_filled_slots,
    _mark_wire_forward_from_index,
    _prepare_obis_selection_slots,
    _RESTAGE_TIMEOUT_TAIL_REASON,
)
from app.adapters.mvp_ami_shared import MvpAmiBootstrapFailure, mvp_ami_bootstrap
from app.config import get_settings
from app.jobs import obis_selection_job_store as job_store
from app.schemas.envelope import (
    ReadObisSelectionPayload,
    RuntimeExecutionDiagnostics,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import ReadObisSelectionRequest
from app.tcp_listener.staged_modem_listener import (
    build_last_tcp_listener_trigger_record,
    get_tcp_modem_listener,
)

log = logging.getLogger(__name__)


def _iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _fail_envelope_early(
    request: ReadObisSelectionRequest,
    started: datetime,
    message: str,
    code: str,
    extras: dict[str, Any],
) -> RuntimeResponseEnvelope:
    from app.schemas.envelope import RuntimeErrorInfo, RuntimeExecutionDiagnostics

    finished = datetime.now(timezone.utc)
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    return RuntimeResponseEnvelope(
        ok=False,
        simulated=False,
        operation="readObisSelection",
        meterId=request.meterId,
        startedAt=_iso_z(started),
        finishedAt=_iso_z(finished),
        durationMs=duration_ms,
        message=message,
        transportState="disconnected",
        associationState="none",
        payload=None,
        error=RuntimeErrorInfo(code=code, message=message, details=extras),
        diagnostics=RuntimeExecutionDiagnostics(
            outcome="attempted_failed",
            capabilityStage="transport_probe",
            transportAttempted=code != "TCP_LISTENER_DISABLED",
            associationAttempted=False,
            verifiedOnWire=False,
            detailCode=code,
        ),
    )


def _next_segment_indices(
    wire_indices: List[int],
    slots: List[Any],
    max_n: int,
) -> List[int]:
    out: List[int] = []
    for wi in wire_indices:
        if slots[wi] is None:
            out.append(wi)
            if len(out) >= max_n:
                break
    return out


def _wait_for_next_staged_socket(
    ctl: Any,
    job_id: str,
    timeout_sec: float,
) -> Tuple[Optional[Any], Optional[str]]:
    deadline = time.monotonic() + timeout_sec
    last_touch = 0.0
    while time.monotonic() < deadline:
        if job_store.cancel_requested(job_id):
            return None, None
        sock, ep, _meta = ctl.take_staged_socket_for_session()
        if sock is not None:
            return sock, ep
        now = time.monotonic()
        if now - last_touch >= 25.0:
            job_store.touch_job_updated(job_id)
            last_touch = now
        rem = deadline - now
        if rem <= 0:
            break
        job_store.wait_restage_signal(min(1.0, rem))
    return None, None


def _bootstrap_for_finalize(settings: Any) -> Any:
    boot = mvp_ami_bootstrap(settings, None)
    if isinstance(boot, MvpAmiBootstrapFailure):
        return SimpleNamespace(app_cfg=None)
    return boot


def _run_job(job_id: str, request: ReadObisSelectionRequest) -> None:
    settings = get_settings()
    started = datetime.now(timezone.utc)
    ctl = get_tcp_modem_listener()
    envelope: Optional[RuntimeResponseEnvelope] = None
    remote: Optional[str] = None
    teardown = "not_applicable"
    done_global = 0
    segments_done = 0
    last_remote: Optional[str] = None

    def progress(patch: Dict[str, Any]) -> None:
        job_store.apply_progress(job_id, patch)

    try:
        with ctl.session_context():
            try:
                if not settings.tcp_listener_enabled:
                    teardown = "listener_disabled"
                    envelope = _fail_envelope_early(
                        request,
                        started,
                        "TCP modem listener is disabled (set SUNRISE_RUNTIME_TCP_LISTENER_ENABLED=true).",
                        "TCP_LISTENER_DISABLED",
                        {
                            "transportMode": "tcp_inbound",
                            "listenerEnabled": False,
                            "jobId": job_id,
                        },
                    )
                    job_store.fail_job(
                        job_id,
                        envelope.error.message if envelope.error else "failed",  # type: ignore[union-attr]
                        envelope.model_dump(mode="json"),
                    )
                    return

                adapter = get_runtime_adapter()
                if not isinstance(adapter, MvpAmiRuntimeAdapter):
                    teardown = "wrong_adapter"
                    envelope = _fail_envelope_early(
                        request,
                        started,
                        "Inbound TCP read-obis-selection requires SUNRISE_RUNTIME_ADAPTER=mvp_ami.",
                        "TCP_LISTENER_REQUIRES_MVP_AMI",
                        {
                            "transportMode": "tcp_inbound",
                            "adapter": settings.adapter,
                            "jobId": job_id,
                        },
                    )
                    job_store.fail_job(
                        job_id,
                        envelope.error.message if envelope.error else "failed",  # type: ignore[union-attr]
                        envelope.model_dump(mode="json"),
                    )
                    return

                slots, wire_unique, wire_indices = _prepare_obis_selection_slots(request)
                if not wire_unique:
                    finished = datetime.now(timezone.utc)
                    n = len(request.selectedItems)
                    final_rows = [slots[i] for i in range(n)]  # type: ignore[list-item]
                    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
                    envelope = RuntimeResponseEnvelope(
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
                    job_store.mark_running(job_id)
                    job_store.complete_job(job_id, envelope.model_dump(mode="json"))
                    return

                sock, endpoint, _meta = ctl.take_staged_socket_for_session()
                if sock is None:
                    teardown = "no_staged_socket"
                    st = ctl.get_status_dict()
                    envelope = _fail_envelope_early(
                        request,
                        started,
                        "No staged inbound TCP socket — wait for modem to connect, then retry.",
                        "NO_STAGED_TCP_SOCKET",
                        {
                            "transportMode": "tcp_inbound",
                            "listenerListening": st.get("listening"),
                            "stagedPresent": st.get("stagedPresent"),
                            "lastBindError": st.get("lastBindError"),
                            "jobId": job_id,
                        },
                    )
                    job_store.fail_job(
                        job_id,
                        envelope.error.message if envelope.error else "failed",  # type: ignore[union-attr]
                        envelope.model_dump(mode="json"),
                    )
                    return

                remote = endpoint
                last_remote = endpoint
                teardown = "server_closed_after_trigger"
                job_store.mark_running(job_id)
                chunk_size = max(1, int(settings.inbound_obis_wire_chunk_size))
                restage_timeout = float(settings.inbound_obis_job_restage_timeout_seconds)
                est_segments = max(1, (len(wire_indices) + chunk_size - 1) // chunk_size)

                log.info(
                    "tcp_listener_obis_selection_job_start",
                    extra={
                        "job_id": job_id,
                        "meter_id": request.meterId,
                        "remote": endpoint,
                        "items": len(request.selectedItems),
                        "chunk_size": chunk_size,
                    },
                )

                while True:
                    segment = _next_segment_indices(wire_indices, slots, chunk_size)
                    if not segment:
                        break

                    try:
                        fatal_seg, done_global = adapter.read_obis_selection_inbound_tcp_job_segment(
                            request,
                            sock,
                            remote or "unknown",
                            slots,
                            wire_indices,
                            segment,
                            progress_callback=progress,
                            job_id=job_id,
                            completed_wire_base=done_global,
                        )
                    finally:
                        try:
                            sock.close()
                        except Exception:  # noqa: BLE001
                            pass
                        sock = None  # type: ignore[assignment]

                    if job_store.cancel_requested(job_id):
                        break

                    if fatal_seg == INBOUND_JOB_SEGMENT_ASSOC_FAILED:
                        job_store.set_waiting_for_restage(
                            job_id,
                            "Association failed; waiting for modem reconnect to retry this segment.",
                            segments_done,
                        )
                        sock, remote = _wait_for_next_staged_socket(ctl, job_id, restage_timeout)
                        job_store.mark_running_after_restage(job_id)
                        if sock is None:
                            if job_store.cancel_requested(job_id):
                                break
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
                                    _RESTAGE_TIMEOUT_TAIL_REASON,
                                    "not_attempted",
                                    progress,
                                    done_global,
                                    len(wire_indices),
                                )
                            break
                        last_remote = remote or last_remote
                        continue

                    if fatal_seg:
                        progress({"fatal": True, "fatalMessage": fatal_seg[:500]})
                        break

                    segments_done += 1

                    if not _next_segment_indices(wire_indices, slots, 1):
                        break

                    left = sum(1 for wi in wire_indices if slots[wi] is None)
                    job_store.set_waiting_for_restage(
                        job_id,
                        f"Waiting for next modem reconnect ({segments_done}/{est_segments} segments done; {left} wire rows left).",
                        segments_done,
                    )
                    sock, remote = _wait_for_next_staged_socket(ctl, job_id, restage_timeout)
                    job_store.mark_running_after_restage(job_id)
                    if sock is None:
                        if job_store.cancel_requested(job_id):
                            break
                        first_open2: Optional[int] = None
                        for wi in wire_indices:
                            if slots[wi] is None:
                                first_open2 = wi
                                break
                        if first_open2 is not None:
                            done_global = _mark_wire_forward_from_index(
                                slots,
                                request.selectedItems,
                                wire_indices,
                                first_open2,
                                _RESTAGE_TIMEOUT_TAIL_REASON,
                                "not_attempted",
                                progress,
                                done_global,
                                len(wire_indices),
                            )
                        break
                    last_remote = remote or last_remote

                boot_final = _bootstrap_for_finalize(settings)
                op_cancel: Optional[str] = (
                    _CANCEL_BATCH_REASON if job_store.cancel_requested(job_id) else None
                )
                envelope = _finalize_obis_selection_filled_slots(
                    request=request,
                    boot=boot_final,
                    started=started,
                    slots=slots,
                    wire_indices=wire_indices,
                    assoc_ok=True,
                    envelope_transport_mode="tcp_inbound",
                    tcp_endpoint=last_remote,
                    operator_cancel_message=op_cancel,
                )
                job_store.complete_job(job_id, envelope.model_dump(mode="json"))
            except Exception as exc:  # noqa: BLE001
                log.exception("tcp_listener_obis_selection_job_failed", extra={"job_id": job_id})
                job_store.fail_job(job_id, str(exc), None)
                envelope = _fail_envelope_early(
                    request,
                    started,
                    f"OBIS selection job crashed: {str(exc)[:400]}",
                    "OBIS_SELECTION_JOB_EXCEPTION",
                    {"jobId": job_id},
                )
            finally:
                if envelope is not None:
                    ctl.record_tcp_listener_trigger(
                        build_last_tcp_listener_trigger_record(
                            operation="readObisSelection",
                            remote_endpoint=last_remote or remote,
                            envelope=envelope,
                            socket_teardown=teardown,
                        )
                    )
    finally:
        ctl.end_inbound_operator_action()


def start_tcp_listener_obis_selection_job(request: ReadObisSelectionRequest) -> str:
    job_id = job_store.create_tcp_inbound_job(request)
    t = threading.Thread(
        target=_run_job,
        args=(job_id, request),
        name=f"obis-sel-job-{job_id[:8]}",
        daemon=True,
    )
    job_store.attach_worker_thread(job_id, t)
    t.start()
    return job_id
