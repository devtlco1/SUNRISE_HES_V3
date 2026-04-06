"""
v1 local read-job queue: in-memory store + single background worker thread.

- Process-local only; restarting the sidecar loses jobs and results.
- FIFO per worker; one job runs at a time (simple, predictable for MVP).
- Worker calls `execute_read_identity` / `execute_read_basic_registers` — no duplicated protocol code.
"""

from __future__ import annotations

import logging
import queue
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from app.jobs.read_job_foundation import ReadJobKind, ReadJobStatus
from app.schemas.requests import ReadBasicRegistersRequest, ReadIdentityRequest

log = logging.getLogger(__name__)

_MAX_COMPLETED_JOBS = 500

_jobs_lock = threading.Lock()
_jobs: dict[str, "JobRecord"] = {}
_job_queue: queue.Queue[str] = queue.Queue()
_shutdown = threading.Event()
_worker_thread: Optional[threading.Thread] = None


def _iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


@dataclass
class JobRecord:
    job_id: str
    kind: ReadJobKind
    status: ReadJobStatus
    meter_id: str
    created_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    identity_request: Optional[ReadIdentityRequest] = None
    basic_request: Optional[ReadBasicRegistersRequest] = None
    _evicted: bool = field(default=False, repr=False)


def _evict_old_completed_unlocked() -> None:
    """Drop oldest succeeded/failed jobs when over cap (best-effort, process-local)."""
    completed = [
        (jid, rec)
        for jid, rec in _jobs.items()
        if rec.status in (ReadJobStatus.SUCCEEDED, ReadJobStatus.FAILED) and rec.finished_at
    ]
    if len(completed) <= _MAX_COMPLETED_JOBS:
        return
    completed.sort(key=lambda x: x[1].finished_at or datetime.min.replace(tzinfo=timezone.utc))
    to_remove = len(completed) - _MAX_COMPLETED_JOBS
    for jid, _ in completed[:to_remove]:
        del _jobs[jid]
        log.debug("read_job_evicted", extra={"job_id": jid})


def enqueue_read_identity(req: ReadIdentityRequest) -> JobRecord:
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    rec = JobRecord(
        job_id=job_id,
        kind=ReadJobKind.READ_IDENTITY,
        status=ReadJobStatus.QUEUED,
        meter_id=req.meterId,
        created_at=now,
        identity_request=req,
    )
    with _jobs_lock:
        _evict_old_completed_unlocked()
        _jobs[job_id] = rec
    _job_queue.put(job_id)
    log.info("read_job_enqueued", extra={"job_id": job_id, "kind": rec.kind.value})
    return rec


def enqueue_read_basic_registers(req: ReadBasicRegistersRequest) -> JobRecord:
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    rec = JobRecord(
        job_id=job_id,
        kind=ReadJobKind.READ_BASIC_REGISTERS,
        status=ReadJobStatus.QUEUED,
        meter_id=req.meterId,
        created_at=now,
        basic_request=req,
    )
    with _jobs_lock:
        _evict_old_completed_unlocked()
        _jobs[job_id] = rec
    _job_queue.put(job_id)
    log.info("read_job_enqueued", extra={"job_id": job_id, "kind": rec.kind.value})
    return rec


def get_job(job_id: str) -> Optional[JobRecord]:
    with _jobs_lock:
        return _jobs.get(job_id)


def _worker_loop() -> None:
    from app.services.read_basic_registers import execute_read_basic_registers
    from app.services.read_identity import execute_read_identity

    log.info("read_job_worker_started")
    while not _shutdown.is_set():
        try:
            job_id = _job_queue.get(timeout=0.5)
        except queue.Empty:
            continue

        with _jobs_lock:
            rec = _jobs.get(job_id)
        if rec is None:
            log.warning("read_job_missing_record", extra={"job_id": job_id})
            continue

        started = datetime.now(timezone.utc)
        with _jobs_lock:
            rec = _jobs.get(job_id)
            if rec is None:
                continue
            rec.status = ReadJobStatus.RUNNING
            rec.started_at = started

        try:
            if rec.kind == ReadJobKind.READ_IDENTITY and rec.identity_request:
                envelope = execute_read_identity(rec.identity_request)
            elif rec.kind == ReadJobKind.READ_BASIC_REGISTERS and rec.basic_request:
                envelope = execute_read_basic_registers(rec.basic_request)
            else:
                raise RuntimeError("Job record missing request payload")

            finished = datetime.now(timezone.utc)
            with _jobs_lock:
                r = _jobs.get(job_id)
                if r:
                    r.status = ReadJobStatus.SUCCEEDED
                    r.finished_at = finished
                    r.result = envelope.model_dump(mode="json")
            log.info("read_job_succeeded", extra={"job_id": job_id, "envelope_ok": envelope.ok})
        except Exception as exc:  # noqa: BLE001
            log.exception("read_job_failed", extra={"job_id": job_id})
            finished = datetime.now(timezone.utc)
            with _jobs_lock:
                r = _jobs.get(job_id)
                if r:
                    r.status = ReadJobStatus.FAILED
                    r.finished_at = finished
                    r.error = str(exc)


def start_read_job_worker() -> None:
    global _worker_thread
    _shutdown.clear()
    if _worker_thread is not None and _worker_thread.is_alive():
        return
    _worker_thread = threading.Thread(
        target=_worker_loop,
        name="sunrise-read-job-worker",
        daemon=True,
    )
    _worker_thread.start()


def stop_read_job_worker() -> None:
    _shutdown.set()
    global _worker_thread
    if _worker_thread is not None:
        _worker_thread.join(timeout=5.0)
        _worker_thread = None
    log.info("read_job_worker_stopped")
