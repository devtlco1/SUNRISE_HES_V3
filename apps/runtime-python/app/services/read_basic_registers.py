"""Application service for read-basic-registers (delegates to protocol adapter)."""

import logging

from app.adapters.factory import get_runtime_adapter
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import ReadBasicRegistersRequest

log = logging.getLogger(__name__)


def execute_read_basic_registers(request: ReadBasicRegistersRequest) -> RuntimeResponseEnvelope:
    adapter = get_runtime_adapter()
    log.info(
        "read_basic_registers",
        extra={
            "meter_id": request.meterId,
            "channel_type": request.channel.type if request.channel else None,
        },
    )
    return adapter.read_basic_registers(request)
