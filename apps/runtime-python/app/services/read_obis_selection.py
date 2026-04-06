"""Parameterized multi-OBIS read (operator selection) — delegates to protocol adapter."""

import logging

from app.adapters.factory import get_runtime_adapter
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import ReadObisSelectionRequest

log = logging.getLogger(__name__)


def execute_read_obis_selection(request: ReadObisSelectionRequest) -> RuntimeResponseEnvelope:
    adapter = get_runtime_adapter()
    log.info(
        "read_obis_selection",
        extra={
            "meter_id": request.meterId,
            "item_count": len(request.selectedItems),
            "channel_type": request.channel.type if request.channel else None,
        },
    )
    return adapter.read_obis_selection(request)
