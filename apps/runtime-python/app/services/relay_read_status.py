"""Relay status read (disconnect-control LN) — delegates to protocol adapter."""

import logging
from datetime import datetime, timezone

from app.adapters.factory import get_runtime_adapter
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import ReadIdentityRequest
from app.services.relay_crash_envelope import envelope_for_relay_service_crash

log = logging.getLogger(__name__)


def execute_relay_read_status(request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    started = datetime.now(timezone.utc)
    try:
        adapter = get_runtime_adapter()
        log.info("relay_read_status", extra={"meter_id": request.meterId})
        return adapter.relay_read_status(request)
    except Exception as exc:  # noqa: BLE001
        return envelope_for_relay_service_crash(
            operation="relayReadStatus",
            meter_id=request.meterId,
            started=started,
            exc=exc,
            message_prefix="Relay read status (direct) failed unexpectedly",
        )
