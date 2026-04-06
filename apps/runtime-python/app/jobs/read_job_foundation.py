"""
Read-job domain types for v1 local queue and future Redis/Celery replacement.

Execution: `app.jobs.local_read_job_queue` runs jobs by calling the same services as
direct HTTP (`execute_read_identity`, `execute_read_basic_registers`).
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
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class ReadJobRequestShape(BaseModel):
    """Serializable unit of work (enqueue body + kind)."""

    meterId: str = Field(..., min_length=1, max_length=128)
    kind: ReadJobKind
    endpointId: Optional[str] = Field(default=None, max_length=256)
    channelHint: Optional[str] = Field(default=None, max_length=256)
    channel: Optional[ChannelSpec] = None
