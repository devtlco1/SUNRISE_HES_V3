"""Inbound API request bodies."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ChannelSpec(BaseModel):
    """Future: serial device, TCP client target, etc. Stub ignores beyond logging."""

    type: Literal["unspecified", "stub", "serial", "tcp_client"] = "unspecified"
    devicePath: Optional[str] = Field(default=None, description="e.g. /dev/ttyUSB0")
    host: Optional[str] = None
    port: Optional[int] = None


class ReadIdentityRequest(BaseModel):
    meterId: str = Field(..., min_length=1, max_length=128)
    endpointId: Optional[str] = Field(default=None, max_length=256)
    channelHint: Optional[str] = Field(default=None, max_length=256)
    channel: Optional[ChannelSpec] = None
