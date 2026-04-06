from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "sunrise-protocol-runtime"
    adapter: str
    """True when `SUNRISE_RUNTIME_MVP_AMI_ROOT` points at an existing directory."""
    mvpAmiRootConfigured: bool = False
