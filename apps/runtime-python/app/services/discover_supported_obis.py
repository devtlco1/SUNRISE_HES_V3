"""Application service for association-view discovery (delegates to protocol adapter)."""

import logging

from app.adapters.factory import get_runtime_adapter
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import DiscoverSupportedObisRequest

log = logging.getLogger(__name__)


def execute_discover_supported_obis(request: DiscoverSupportedObisRequest) -> RuntimeResponseEnvelope:
    adapter = get_runtime_adapter()
    log.info(
        "discover_supported_obis",
        extra={
            "meter_id": request.meterId,
            "channel_type": request.channel.type if request.channel else None,
        },
    )
    return adapter.discover_supported_obis(request)
