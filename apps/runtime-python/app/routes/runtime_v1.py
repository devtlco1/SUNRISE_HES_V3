import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import Settings, get_settings
from app.schemas.envelope import RuntimeResponseEnvelope
from app.schemas.requests import ReadBasicRegistersRequest, ReadIdentityRequest
from app.services.read_basic_registers import execute_read_basic_registers
from app.services.read_identity import execute_read_identity

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
