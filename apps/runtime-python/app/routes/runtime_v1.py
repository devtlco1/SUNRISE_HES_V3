import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import JSONResponse

from app.config import Settings, get_settings
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import (
    DiscoverSupportedObisRequest,
    ReadBasicRegistersRequest,
    ReadIdentityRequest,
    ReadObisSelectionRequest,
)
from app.services.discover_supported_obis import execute_discover_supported_obis
from app.services.read_basic_registers import execute_read_basic_registers
from app.services.read_identity import execute_read_identity
from app.services.read_obis_selection import execute_read_obis_selection
from app.services.relay_disconnect import execute_relay_disconnect
from app.services.relay_read_status import execute_relay_read_status
from app.services.relay_reconnect import execute_relay_reconnect

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/runtime", tags=["runtime-v1"])


def verify_service_token(
    authorization: Optional[str] = Header(default=None, alias="Authorization"),
    settings: Settings = Depends(get_settings),
) -> None:
    token = settings.service_token
    if not token:
        return
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization: Bearer token",
        )
    provided = authorization.removeprefix("Bearer ").strip()
    if provided != token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
        )


@router.post(
    "/read-identity",
    response_model=RuntimeResponseEnvelope,
    dependencies=[Depends(verify_service_token)],
)
def post_read_identity(body: ReadIdentityRequest) -> RuntimeResponseEnvelope:
    log.info("http_read_identity", extra={"meter_id": body.meterId})
    return execute_read_identity(body)


@router.post(
    "/read-basic-registers",
    response_model=RuntimeResponseEnvelope,
    dependencies=[Depends(verify_service_token)],
)
def post_read_basic_registers(body: ReadBasicRegistersRequest) -> RuntimeResponseEnvelope:
    log.info("http_read_basic_registers", extra={"meter_id": body.meterId})
    return execute_read_basic_registers(body)


@router.post(
    "/read-obis-selection",
    dependencies=[Depends(verify_service_token)],
)
def post_read_obis_selection(body: ReadObisSelectionRequest) -> JSONResponse:
    log.info(
        "http_read_obis_selection",
        extra={"meter_id": body.meterId, "items": len(body.selectedItems)},
    )
    envelope = execute_read_obis_selection(body)
    return JSONResponse(content=envelope.model_dump(mode="json"))


@router.post(
    "/discover-supported-obis",
    response_model=RuntimeResponseEnvelope,
    dependencies=[Depends(verify_service_token)],
)
def post_discover_supported_obis(body: DiscoverSupportedObisRequest) -> RuntimeResponseEnvelope:
    log.info("http_discover_supported_obis", extra={"meter_id": body.meterId})
    return execute_discover_supported_obis(body)


@router.post(
    "/relay-read-status",
    dependencies=[Depends(verify_service_token)],
)
def post_relay_read_status(body: ReadIdentityRequest) -> JSONResponse:
    log.info("http_relay_read_status", extra={"meter_id": body.meterId})
    envelope = execute_relay_read_status(body)
    return JSONResponse(content=envelope.model_dump(mode="json"))


@router.post(
    "/relay-disconnect",
    dependencies=[Depends(verify_service_token)],
)
def post_relay_disconnect(body: ReadIdentityRequest) -> JSONResponse:
    log.info("http_relay_disconnect", extra={"meter_id": body.meterId})
    envelope = execute_relay_disconnect(body)
    return JSONResponse(content=envelope.model_dump(mode="json"))


@router.post(
    "/relay-reconnect",
    dependencies=[Depends(verify_service_token)],
)
def post_relay_reconnect(body: ReadIdentityRequest) -> JSONResponse:
    log.info("http_relay_reconnect", extra={"meter_id": body.meterId})
    envelope = execute_relay_reconnect(body)
    return JSONResponse(content=envelope.model_dump(mode="json"))
