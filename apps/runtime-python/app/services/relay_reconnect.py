"""Remote relay ON (COSEM disconnect-control method 2) — delegates to protocol adapter."""

import logging

from app.adapters.factory import get_runtime_adapter
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import ReadIdentityRequest

log = logging.getLogger(__name__)


def execute_relay_reconnect(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    adapter = get_runtime_adapter()
    log.info("relay_reconnect", extra={"meter_id": request.meterId})
    return adapter.relay_reconnect(request)
