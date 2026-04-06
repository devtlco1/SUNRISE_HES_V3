"""Inbound modem TCP listener — staged socket status + explicit read-identity trigger."""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.routes.runtime_v1 import verify_service_token
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import (
    ReadBasicRegistersRequest,
    ReadIdentityRequest,
    ReadObisSelectionRequest,
)
from app.services.tcp_listener_read_basic_registers import (
    execute_tcp_listener_read_basic_registers,
)
from app.services.tcp_listener_read_identity import execute_tcp_listener_read_identity
from app.services.tcp_listener_read_obis_selection import (
    execute_tcp_listener_read_obis_selection,
)
from app.tcp_listener.staged_modem_listener import get_tcp_modem_listener

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/runtime/tcp-listener", tags=["tcp-listener-v1"])


@router.get(
    "/status",
    dependencies=[Depends(verify_service_token)],
)
def get_tcp_listener_status() -> Dict[str, Any]:
    """Listener bind state, staged modem socket metadata, last replacement reason."""
    return get_tcp_modem_listener().get_status_dict()


@router.post(
    "/read-identity",
    response_model=RuntimeResponseEnvelope,
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_read_identity(body: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    """
    Run read-identity on the currently staged inbound TCP socket (modem already connected).
    Does not dial outbound. Pops the staged socket for the duration of the call.
    """
    log.info("http_tcp_listener_read_identity", extra={"meter_id": body.meterId})
    return execute_tcp_listener_read_identity(body)


@router.post(
    "/read-basic-registers",
    response_model=RuntimeResponseEnvelope,
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_read_basic_registers(
    body: ReadBasicRegistersRequest,
) -> RuntimeResponseEnvelope:
    """
    Run read-basic-registers on the currently staged inbound TCP socket (modem already connected).
    Pops the staged socket for the duration of the call; closes it when done (same as read-identity).
    """
    log.info("http_tcp_listener_read_basic_registers", extra={"meter_id": body.meterId})
    return execute_tcp_listener_read_basic_registers(body)


@router.post(
    "/read-obis-selection",
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_read_obis_selection(
    body: ReadObisSelectionRequest,
) -> JSONResponse:
    """
    Run read-obis-selection on the staged inbound TCP socket (one MVP-AMI phase1, multiple OBIS).
    Pops the staged socket; closes it when done.
    """
    log.info(
        "http_tcp_listener_read_obis_selection",
        extra={"meter_id": body.meterId, "items": len(body.selectedItems)},
    )
    envelope = execute_tcp_listener_read_obis_selection(body)
    # Avoid FastAPI response_model Union validation issues on payload variants.
    return JSONResponse(content=envelope.model_dump(mode="json"))
