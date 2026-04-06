"""Application service for read-identity (delegates to protocol adapter)."""

import logging

from app.adapters.factory import get_runtime_adapter
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import ReadIdentityRequest

log = logging.getLogger(__name__)


def execute_read_identity(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    adapter = get_runtime_adapter()
    log.info(
        "read_identity",
        extra={
            "meter_id": request.meterId,
            "channel_type": request.channel.type if request.channel else None,
        },
    )
    return adapter.read_identity(request)
