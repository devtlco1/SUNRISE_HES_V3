"""FastAPI entrypoint — Sunrise protocol runtime sidecar."""

import logging

from fastapi import FastAPI

from app.config import get_settings
from app.logging_setup import configure_logging
from app.routes.health import router as health_router
from app.routes.runtime_v1 import router as runtime_v1_router

configure_logging()
log = logging.getLogger(__name__)

settings = get_settings()
app = FastAPI(
    title="Sunrise HES Protocol Runtime",
    version="0.1.0",
    description="Python sidecar for DLMS/COSEM — control plane stays in Next.js.",
)

app.include_router(health_router)
app.include_router(runtime_v1_router)


@app.on_event("startup")
async def startup() -> None:
    log.info(
        "startup",
        extra={
            "host": settings.host,
            "port": settings.port,
            "adapter": settings.adapter,
            "auth_configured": bool(settings.service_token),
        },
    )
