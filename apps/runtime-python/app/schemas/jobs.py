"""HTTP contracts for v1 local read-job queue (aligned with sidecar JSON)."""

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from app.jobs.read_job_foundation import ReadJobKind, ReadJobStatus

LOCAL_READ_JOB_QUEUE_V1_NOTE = (
    "v1 in-process queue: single Python process, not durable across restart. "
    "Replace with Redis/worker pool when scaling."
)


class ReadJobEnqueueResponse(BaseModel):
    jobId: str
    kind: ReadJobKind
    status: Literal["queued"] = Field(default="queued")
    meterId: str
    createdAt: str
    note: str = Field(default=LOCAL_READ_JOB_QUEUE_V1_NOTE)


class ReadJobStatusResponse(BaseModel):
    jobId: str
    kind: ReadJobKind
    status: ReadJobStatus
    meterId: str
    createdAt: str
    startedAt: Optional[str] = None
    finishedAt: Optional[str] = None
    """Full `RuntimeResponseEnvelope` as JSON when the worker finished without crashing."""
    result: Optional[dict[str, Any]] = None
    """Worker/infrastructure failure only; meter-level failures appear in `result` with ok=false."""
    error: Optional[str] = None
    note: str = Field(default=LOCAL_READ_JOB_QUEUE_V1_NOTE)
