"""Inbound API request bodies."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ChannelSpec(BaseModel):
    """Transport hints: serial device path, or TCP client (modem / transparent GPRS tunnel)."""

    type: Literal["unspecified", "stub", "serial", "tcp_client", "tcp"] = "unspecified"
    devicePath: Optional[str] = Field(default=None, description="e.g. /dev/ttyUSB0 (serial)")
    host: Optional[str] = Field(default=None, description="TCP client target host (type tcp / tcp_client)")
    port: Optional[int] = Field(default=None, description="TCP client target port")
    connectTimeoutSeconds: Optional[float] = Field(
        default=None,
        ge=0.5,
        le=120.0,
        description="Override SUNRISE_RUNTIME_TCP_CLIENT_CONNECT_TIMEOUT_SECONDS for this request.",
    )


class ReadIdentityRequest(BaseModel):
    meterId: str = Field(..., min_length=1, max_length=128)
    endpointId: Optional[str] = Field(default=None, max_length=256)
    channelHint: Optional[str] = Field(default=None, max_length=256)
    channel: Optional[ChannelSpec] = None


class ReadBasicRegistersRequest(BaseModel):
    meterId: str = Field(..., min_length=1, max_length=128)
    endpointId: Optional[str] = Field(default=None, max_length=256)
    channelHint: Optional[str] = Field(default=None, max_length=256)
    channel: Optional[ChannelSpec] = None


class DiscoverSupportedObisRequest(BaseModel):
    """Dedicated discovery call (not for routine polling). Same transport hints as read-identity."""

    meterId: str = Field(..., min_length=1, max_length=128)
    endpointId: Optional[str] = Field(default=None, max_length=256)
    channelHint: Optional[str] = Field(default=None, max_length=256)
    channel: Optional[ChannelSpec] = None
