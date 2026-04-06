import logging

from fastapi import APIRouter

from app.config import get_settings
from app.schemas.health import HealthResponse

log = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    settings = get_settings()
    log.debug("health_check")
    return HealthResponse(adapter=settings.adapter)
