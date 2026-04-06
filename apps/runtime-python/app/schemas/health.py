from typing import Optional

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "sunrise-protocol-runtime"
    adapter: str
    """True when `SUNRISE_RUNTIME_MVP_AMI_ROOT` points at an existing directory."""
    mvpAmiRootConfigured: bool = False
    tcpModemListenerEnabled: bool = False
    tcpModemListenerListening: bool = False
    """Configured bind host:port when listener env is enabled (may still fail to bind)."""
    tcpModemListenerBind: Optional[str] = None
    tcpStagedSocketPresent: bool = False
    """Remote endpoint of staged inbound modem socket, if any."""
    tcpStagedRemote: Optional[str] = None
