from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str = "sunrise-protocol-runtime"
    adapter: str
