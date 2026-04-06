"""FastAPI entrypoint — Sunrise protocol runtime sidecar."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import get_settings
from app.logging_setup import configure_logging
from app.routes.health import router as health_router
from app.routes.jobs_v1 import router as jobs_v1_router
from app.routes.runtime_v1 import router as runtime_v1_router

configure_logging()
log = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.jobs.local_read_job_queue import start_read_job_worker, stop_read_job_worker

    start_read_job_worker()
    log.info(
        "startup",
        extra={
            "host": settings.host,
            "port": settings.port,
            "adapter": settings.adapter,
            "auth_configured": bool(settings.service_token),
            "read_job_worker": True,
        },
    )
    yield
    stop_read_job_worker()


app = FastAPI(
    title="Sunrise HES Protocol Runtime",
    version="0.1.0",
    description="Python sidecar for DLMS/COSEM — control plane stays in Next.js.",
    lifespan=lifespan,
)

app.include_router(health_router)
app.include_router(runtime_v1_router)
app.include_router(jobs_v1_router)
