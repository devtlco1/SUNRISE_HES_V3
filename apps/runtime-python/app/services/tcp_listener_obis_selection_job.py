"""Background job: sequential read-obis-selection on one inbound staged socket (progress + polling)."""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.adapters.factory import get_runtime_adapter
from app.adapters.mvp_ami_adapter import MvpAmiRuntimeAdapter
from app.config import get_settings
from app.jobs import obis_selection_job_store as job_store
from app.schemas.envelope import RuntimeResponseEnvelope
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


def _run_job(job_id: str, request: ReadObisSelectionRequest) -> None:
    settings = get_settings()
    started = datetime.now(timezone.utc)
    ctl = get_tcp_modem_listener()
    envelope: Optional[RuntimeResponseEnvelope] = None
    remote: Optional[str] = None
    teardown = "not_applicable"

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
                teardown = "server_closed_after_trigger"
                job_store.mark_running(job_id)
                log.info(
                    "tcp_listener_obis_selection_job_start",
                    extra={
                        "job_id": job_id,
                        "meter_id": request.meterId,
                        "remote": endpoint,
                        "items": len(request.selectedItems),
                    },
                )
                try:
                    envelope = adapter.read_obis_selection_inbound_tcp_sequential(
                        request,
                        sock,
                        endpoint,
                        progress_callback=progress,
                        job_id=job_id,
                    )
                finally:
                    try:
                        sock.close()
                    except Exception:  # noqa: BLE001
                        pass

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
                            remote_endpoint=remote,
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
