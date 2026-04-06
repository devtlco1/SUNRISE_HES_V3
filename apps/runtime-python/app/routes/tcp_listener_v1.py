"""Inbound modem TCP listener — staged socket status + explicit read-identity trigger."""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.routes.runtime_v1 import verify_service_token
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import ReadIdentityRequest
from app.services.tcp_listener_read_identity import execute_tcp_listener_read_identity
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
