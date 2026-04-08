"""
In-memory job state for sequential read-obis-selection (progress + polling).

Process-local only (single uvicorn worker). Not durable across restarts.
"""

from __future__ import annotations

import threading
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.schemas.envelope import ObisSelectionRowResult
from app.schemas.requests import ReadObisSelectionRequest


def _iso_z() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class ObisSelectionJobStatus(str, Enum):
    queued = "queued"
    running = "running"
    waiting_for_restage = "waiting_for_restage"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class ObisSelectionJobRowView(BaseModel):
    """One selected row for operator polling."""

    index: int
    obis: str
    phase: str  # queued | running | ok | error | unsupported | not_attempted
    row: Optional[Dict[str, Any]] = None


class ObisSelectionJobView(BaseModel):
    jobId: str
    status: ObisSelectionJobStatus
    meterId: str
    transport: str = "tcp_inbound"
    totalRows: int
    wireTotal: int
    completedWire: int
    currentObis: Optional[str] = None
    currentIndex: Optional[int] = None
    fatalError: Optional[str] = None
    stale: bool = False
    restageMessage: Optional[str] = None
    restageSegmentsDone: int = 0
    rows: List[ObisSelectionJobRowView]
    updatedAt: str
    envelope: Optional[Dict[str, Any]] = None  # final RuntimeResponseEnvelope as JSON when done


class _JobInternal:
    __slots__ = (
        "job_id",
        "request",
        "transport",
        "status",
        "row_views",
        "wire_indices",
        "completed_wire",
        "current_obis",
        "current_index",
        "fatal_error",
        "envelope",
        "updated_at",
        "created_at",
        "worker_thread",
        "cancel_requested",
        "skipped_indices",
        "restage_message",
        "restage_segments_done",
    )

    def __init__(
        self,
        job_id: str,
        request: ReadObisSelectionRequest,
        transport: str,
        row_views: List[ObisSelectionJobRowView],
        wire_indices: List[int],
    ) -> None:
        self.job_id = job_id
        self.request = request
        self.transport = transport
        self.status = ObisSelectionJobStatus.queued
        self.row_views = row_views
        self.wire_indices = wire_indices
        self.completed_wire = 0
        self.current_obis: Optional[str] = None
        self.current_index: Optional[int] = None
        self.fatal_error: Optional[str] = None
        self.envelope: Optional[Dict[str, Any]] = None
        self.worker_thread: Optional[threading.Thread] = None
        self.cancel_requested: bool = False
        self.skipped_indices: set[int] = set()
        self.restage_message: Optional[str] = None
        self.restage_segments_done: int = 0
        now = _iso_z()
        self.updated_at = now
        self.created_at = now


_store: Dict[str, _JobInternal] = {}
_lock = threading.Lock()
_restage_cv = threading.Condition()

# If a job stays "running" longer than this, GET marks stale=True (operator hint).
STALE_AFTER_SECONDS = 480


def create_tcp_inbound_job(request: ReadObisSelectionRequest) -> str:
    from app.adapters.mvp_ami_adapter import _prepare_obis_selection_slots

    job_id = str(uuid.uuid4())
    slots, _wire_unique, wire_indices = _prepare_obis_selection_slots(request)
    items = request.selectedItems
    n = len(items)
    row_views: List[ObisSelectionJobRowView] = []
    for i in range(n):
        item = items[i]
        if slots[i] is not None:
            r = slots[i]
            assert r is not None
            if r.status == "unsupported":
                phase = "unsupported"
            elif r.status == "error":
                phase = "error"
            elif r.status == "not_attempted":
                phase = "not_attempted"
            else:
                phase = "ok"
            row_views.append(
                ObisSelectionJobRowView(
                    index=i,
                    obis=item.obis,
                    phase=phase,
                    row=r.model_dump(mode="json"),
                )
            )
        else:
            row_views.append(
                ObisSelectionJobRowView(
                    index=i,
                    obis=item.obis,
                    phase="queued",
                )
            )

    internal = _JobInternal(job_id, request, "tcp_inbound", row_views, wire_indices)
    with _lock:
        _store[job_id] = internal
    return job_id


def attach_worker_thread(job_id: str, thread: threading.Thread) -> None:
    with _lock:
        j = _store.get(job_id)
        if j:
            j.worker_thread = thread


def _maybe_reconcile_stale_job_locked(job: _JobInternal) -> None:
    """If the worker thread died without writing a terminal state, mark failed (unblocks stale triggers)."""
    if job.status not in (ObisSelectionJobStatus.running, ObisSelectionJobStatus.waiting_for_restage):
        return
    wt = job.worker_thread
    if wt is not None and wt.is_alive():
        return
    try:
        t0 = datetime.fromisoformat(job.updated_at.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - t0).total_seconds()
    except Exception:  # noqa: BLE001
        return
    if age < 3.0:
        return
    job.status = ObisSelectionJobStatus.failed
    job.fatal_error = job.fatal_error or "Job worker stopped without completing (process may have crashed)"
    job.updated_at = _iso_z()


def get_job(job_id: str) -> Optional[ObisSelectionJobView]:
    with _lock:
        job = _store.get(job_id)
        if job is None:
            return None
        _maybe_reconcile_stale_job_locked(job)
        return _to_view_locked(job)


def mark_running(job_id: str) -> None:
    with _lock:
        j = _store.get(job_id)
        if j:
            j.status = ObisSelectionJobStatus.running
            j.updated_at = _iso_z()


def apply_progress(job_id: str, patch: Dict[str, Any]) -> None:
    with _lock:
        j = _store.get(job_id)
        if not j:
            return
        j.updated_at = _iso_z()
        if "currentObis" in patch:
            j.current_obis = patch.get("currentObis")
        if "currentIndex" in patch:
            idx = patch.get("currentIndex")
            j.current_index = idx
            if isinstance(idx, int):
                for rv in j.row_views:
                    if rv.phase == "running" and rv.row is None:
                        rv.phase = "queued"
                for rv in j.row_views:
                    if rv.index == idx and rv.row is None:
                        rv.phase = "running"
                        break
        if "completedWire" in patch:
            j.completed_wire = int(patch["completedWire"])
        if "rowDoneIndex" in patch and "row" in patch:
            idx = int(patch["rowDoneIndex"])
            row_dict = patch["row"]
            phase_override = patch.get("rowPhase")
            for rv in j.row_views:
                if rv.index == idx:
                    if isinstance(phase_override, str) and phase_override.strip():
                        rv.phase = phase_override.strip()
                    else:
                        st = row_dict.get("status") or "error"
                        if st == "not_attempted":
                            rv.phase = "not_attempted"
                        elif st == "ok":
                            rv.phase = "ok"
                        elif st == "unsupported":
                            rv.phase = "unsupported"
                        else:
                            rv.phase = "error"
                    rv.row = row_dict
                    break
        if patch.get("fatal"):
            j.fatal_error = patch.get("fatalMessage") or "session_error"


def notify_staged_inbound_arrival() -> None:
    """Wake OBIS job workers waiting for the next modem-dial / staged socket."""
    with _restage_cv:
        _restage_cv.notify_all()


def wait_restage_signal(timeout_seconds: float) -> None:
    """Block up to timeout_seconds until notify_staged_inbound_arrival() or spurious wakeup."""
    with _restage_cv:
        _restage_cv.wait(timeout=max(0.0, float(timeout_seconds)))


def touch_job_updated(job_id: str) -> None:
    with _lock:
        j = _store.get(job_id)
        if j:
            j.updated_at = _iso_z()


def set_waiting_for_restage(job_id: str, message: str, segments_done: int) -> None:
    with _lock:
        j = _store.get(job_id)
        if not j:
            return
        j.status = ObisSelectionJobStatus.waiting_for_restage
        j.restage_message = message
        j.restage_segments_done = int(segments_done)
        j.current_obis = None
        j.current_index = None
        j.updated_at = _iso_z()


def mark_running_after_restage(job_id: str) -> None:
    with _lock:
        j = _store.get(job_id)
        if not j:
            return
        j.status = ObisSelectionJobStatus.running
        j.restage_message = None
        j.updated_at = _iso_z()


def request_cancel(job_id: str) -> bool:
    """Operator cancel: worker stops before the next wire row (current read may finish)."""
    with _lock:
        job = _store.get(job_id)
        if not job or job.status not in (
            ObisSelectionJobStatus.running,
            ObisSelectionJobStatus.waiting_for_restage,
        ):
            return False
        job.cancel_requested = True
        job.updated_at = _iso_z()
    return True


def skip_queued_row(job_id: str, index: int) -> tuple[bool, str]:
    """Remove one still-queued wire row from the batch (not started on wire yet)."""
    with _lock:
        job = _store.get(job_id)
        if not job or job.status not in (
            ObisSelectionJobStatus.running,
            ObisSelectionJobStatus.waiting_for_restage,
        ):
            return False, "JOB_NOT_RUNNING"
        if index not in job.wire_indices:
            return False, "NOT_A_WIRE_ROW"
        if index in job.skipped_indices:
            return False, "ALREADY_SKIPPED"
        for rv in job.row_views:
            if rv.index == index:
                if rv.phase != "queued" or rv.row is not None:
                    return False, "ROW_NOT_QUEUED"
                break
        else:
            return False, "ROW_NOT_FOUND"
        job.skipped_indices.add(index)
        job.updated_at = _iso_z()
    return True, ""


def is_wire_index_skipped(job_id: str, wire_index: int) -> bool:
    with _lock:
        job = _store.get(job_id)
        if not job:
            return False
        return wire_index in job.skipped_indices


def cancel_requested(job_id: str) -> bool:
    with _lock:
        job = _store.get(job_id)
        return bool(job and job.cancel_requested)


def complete_job(job_id: str, envelope_dict: Dict[str, Any]) -> None:
    with _lock:
        j = _store.get(job_id)
        if not j:
            return
        if j.cancel_requested:
            j.status = ObisSelectionJobStatus.cancelled
        elif j.fatal_error:
            j.status = ObisSelectionJobStatus.failed
        else:
            j.status = ObisSelectionJobStatus.completed
        j.envelope = envelope_dict
        j.updated_at = _iso_z()
        j.current_obis = None
        j.completed_wire = len(j.wire_indices)
        rows = (envelope_dict.get("payload") or {}).get("rows")
        if isinstance(rows, list):
            for i, _item in enumerate(j.request.selectedItems):
                if i >= len(rows):
                    break
                r = rows[i]
                if not isinstance(r, dict):
                    continue
                for rv in j.row_views:
                    if rv.index == i:
                        if (
                            rv.phase == "ok"
                            and rv.row
                            and isinstance(rv.row, dict)
                            and rv.row.get("status") == "ok"
                            and r.get("status") == "error"
                        ):
                            break
                        st = r.get("status") or "error"
                        err_txt = str(r.get("error") or "")
                        if st == "not_attempted":
                            if "removed_from_queue_by_operator" in err_txt:
                                rv.phase = "skipped"
                            elif "cancelled by operator" in err_txt.lower():
                                rv.phase = "cancelled"
                            else:
                                rv.phase = "not_attempted"
                        elif st == "ok":
                            rv.phase = "ok"
                        elif st == "unsupported":
                            rv.phase = "unsupported"
                        else:
                            rv.phase = "error"
                        rv.row = r
                        break


def fail_job(job_id: str, message: str, envelope_dict: Optional[Dict[str, Any]] = None) -> None:
    with _lock:
        j = _store.get(job_id)
        if not j:
            return
        j.status = ObisSelectionJobStatus.failed
        j.fatal_error = message
        if envelope_dict:
            j.envelope = envelope_dict
        j.updated_at = _iso_z()


def _to_view_locked(job: _JobInternal) -> ObisSelectionJobView:
    stale = False
    if job.status in (
        ObisSelectionJobStatus.running,
        ObisSelectionJobStatus.waiting_for_restage,
    ):
        try:
            t0 = datetime.fromisoformat(job.updated_at.replace("Z", "+00:00"))
            dt = datetime.now(timezone.utc) - t0
            stale = dt.total_seconds() > STALE_AFTER_SECONDS
        except Exception:  # noqa: BLE001
            pass

    return ObisSelectionJobView(
        jobId=job.job_id,
        status=job.status,
        meterId=job.request.meterId,
        transport=job.transport,
        totalRows=len(job.request.selectedItems),
        wireTotal=len(job.wire_indices),
        completedWire=job.completed_wire,
        currentObis=job.current_obis,
        currentIndex=job.current_index,
        fatalError=job.fatal_error,
        stale=stale,
        restageMessage=job.restage_message,
        restageSegmentsDone=job.restage_segments_done,
        rows=list(job.row_views),
        updatedAt=job.updated_at,
        envelope=job.envelope,
    )


def peek_request(job_id: str) -> Optional[ReadObisSelectionRequest]:
    with _lock:
        j = _store.get(job_id)
        return j.request if j else None


def _parse_iso_ts_seconds(s: str) -> float:
    try:
        t = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return t.timestamp()
    except Exception:  # noqa: BLE001
        return 0.0


_ACTIVE_STATUSES = frozenset(
    {
        ObisSelectionJobStatus.queued,
        ObisSelectionJobStatus.running,
        ObisSelectionJobStatus.waiting_for_restage,
    }
)
_TERMINAL_STATUSES = frozenset(
    {
        ObisSelectionJobStatus.completed,
        ObisSelectionJobStatus.failed,
        ObisSelectionJobStatus.cancelled,
    }
)


def lookup_jobs_for_meter_reattach(
    meter_id: str,
    terminal_max_age_seconds: float = 604800.0,
) -> tuple[Optional[ObisSelectionJobView], Optional[ObisSelectionJobView]]:
    """
    Find (active_job, recent_terminal_job) for operator UI reattachment after navigation/refresh.

    Active: non-terminal job for this meterId with greatest updatedAt.
    Recent terminal: latest completed/failed/cancelled for this meter within max_age (only if needed for results hydration).
    """
    mid = (meter_id or "").strip()
    if not mid:
        return None, None

    now_ts = datetime.now(timezone.utc).timestamp()
    best_active: Optional[tuple[float, str]] = None
    best_terminal: Optional[tuple[float, str]] = None

    with _lock:
        for jid, j in _store.items():
            if j.request.meterId.strip() != mid:
                continue
            ts = _parse_iso_ts_seconds(j.updated_at)
            if j.status in _ACTIVE_STATUSES:
                if best_active is None or ts >= best_active[0]:
                    best_active = (ts, jid)
            elif j.status in _TERMINAL_STATUSES:
                if now_ts - ts <= terminal_max_age_seconds:
                    if best_terminal is None or ts >= best_terminal[0]:
                        best_terminal = (ts, jid)

    active_view: Optional[ObisSelectionJobView] = None
    terminal_view: Optional[ObisSelectionJobView] = None

    if best_active:
        j = _store.get(best_active[1])
        if j:
            _maybe_reconcile_stale_job_locked(j)
            active_view = _to_view_locked(j)

    if best_terminal:
        jt = _store.get(best_terminal[1])
        if jt:
            terminal_view = _to_view_locked(jt)

    if active_view is not None:
        return active_view, None

    return None, terminal_view
