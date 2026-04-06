"""
Minimal read-job domain foundation — no queue, no workers yet.

Future: a worker process will dequeue `ReadJobKind` work items and call the same adapter
methods as the synchronous HTTP routes (`execute_read_identity`, `execute_read_basic_registers`).
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.requests import ChannelSpec


class ReadJobKind(str, Enum):
    READ_IDENTITY = "readIdentity"
    READ_BASIC_REGISTERS = "readBasicRegisters"


class ReadJobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class ReadJobRequestShape(BaseModel):
    """Serializable unit of work (what would be enqueued)."""

    meterId: str = Field(..., min_length=1, max_length=128)
    kind: ReadJobKind
    endpointId: Optional[str] = Field(default=None, max_length=256)
    channelHint: Optional[str] = Field(default=None, max_length=256)
    channel: Optional[ChannelSpec] = None


class ReadJobPlaceholder(BaseModel):
    """Mirror of `lib/jobs/foundation.ts` — not persisted."""

    id: str
    meterId: str
    operation: ReadJobKind
    status: ReadJobStatus
    queueRef: Optional[str] = None
    createdAtIso: Optional[str] = None
    finishedAtIso: Optional[str] = None


def enqueue_read_job_placeholder(_job: ReadJobRequestShape) -> None:
    """Reserved: wire to Redis/BullMQ/Celery in a later phase."""
    raise NotImplementedError("Queue-backed enqueue is not implemented yet.")
