"""Inbound modem TCP listener — staged socket status + explicit read-identity trigger."""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.jobs import obis_selection_job_store as obis_job_store
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
from app.services.tcp_listener_obis_selection_job import (
    start_tcp_listener_obis_selection_job,
)
from app.services.tcp_listener_read_obis_selection import (
    execute_tcp_listener_read_obis_selection,
)
from app.services.tcp_listener_relay import (
    execute_tcp_listener_relay_disconnect,
    execute_tcp_listener_relay_read_status,
    execute_tcp_listener_relay_reconnect,
)
from app.tcp_listener.staged_modem_listener import get_tcp_modem_listener

log = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/runtime/tcp-listener", tags=["tcp-listener-v1"])


def _maybe_session_busy_json(envelope: RuntimeResponseEnvelope) -> JSONResponse | None:
    err = envelope.error
    if err is not None and err.code == "SESSION_BUSY":
        return JSONResponse(status_code=409, content=envelope.model_dump(mode="json"))
    return None


@router.get(
    "/status",
    dependencies=[Depends(verify_service_token)],
)
def get_tcp_listener_status() -> Dict[str, Any]:
    """Listener bind state, staged modem socket metadata, last replacement reason."""
    return get_tcp_modem_listener().get_status_dict()


@router.post(
    "/read-identity",
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_read_identity(body: ReadIdentityRequest) -> JSONResponse:
    """
    Run read-identity on the currently staged inbound TCP socket (modem already connected).
    Does not dial outbound. Pops the staged socket for the duration of the call.
    """
    log.info("http_tcp_listener_read_identity", extra={"meter_id": body.meterId})
    envelope = execute_tcp_listener_read_identity(body)
    busy = _maybe_session_busy_json(envelope)
    if busy is not None:
        return busy
    return JSONResponse(content=envelope.model_dump(mode="json"))


@router.post(
    "/read-basic-registers",
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_read_basic_registers(
    body: ReadBasicRegistersRequest,
) -> JSONResponse:
    """
    Run read-basic-registers on the currently staged inbound TCP socket (modem already connected).
    Pops the staged socket for the duration of the call; closes it when done (same as read-identity).
    """
    log.info("http_tcp_listener_read_basic_registers", extra={"meter_id": body.meterId})
    envelope = execute_tcp_listener_read_basic_registers(body)
    busy = _maybe_session_busy_json(envelope)
    if busy is not None:
        return busy
    return JSONResponse(content=envelope.model_dump(mode="json"))


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
    busy = _maybe_session_busy_json(envelope)
    if busy is not None:
        return busy
    return JSONResponse(content=envelope.model_dump(mode="json"))


@router.post(
    "/read-obis-selection/start",
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_read_obis_selection_start(body: ReadObisSelectionRequest) -> JSONResponse:
    """
    Start a background sequential read-obis-selection job on the staged inbound socket.
    Returns immediately with jobId; poll GET .../job/{jobId} for progress.
    """
    log.info(
        "http_tcp_listener_read_obis_selection_start",
        extra={"meter_id": body.meterId, "items": len(body.selectedItems)},
    )
    ctl = get_tcp_modem_listener()
    if not ctl.begin_inbound_operator_action():
        return JSONResponse(
            status_code=409,
            content={
                "error": "SESSION_BUSY",
                "message": "Inbound modem action already in progress.",
            },
        )
    try:
        jid = start_tcp_listener_obis_selection_job(body)
    except Exception:
        ctl.end_inbound_operator_action()
        raise
    return JSONResponse(content={"jobId": jid})


@router.get(
    "/read-obis-selection/job/{job_id}",
    dependencies=[Depends(verify_service_token)],
)
def get_tcp_listener_read_obis_selection_job(job_id: str) -> JSONResponse:
    """Poll in-memory job state (per-row progress + final envelope when done)."""
    view = obis_job_store.get_job(job_id)
    if view is None:
        return JSONResponse(
            status_code=404,
            content={"error": "JOB_NOT_FOUND", "message": job_id},
        )
    return JSONResponse(content=view.model_dump(mode="json"))


class ObisJobSkipBody(BaseModel):
    index: int = Field(ge=0, description="selectedItems index; must still be queued on the wire")


@router.post(
    "/read-obis-selection/job/{job_id}/cancel",
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_read_obis_selection_job_cancel(job_id: str) -> JSONResponse:
    """Request cooperative cancel: worker stops before the next OBIS (current read may finish)."""
    if obis_job_store.request_cancel(job_id):
        return JSONResponse(content={"ok": True, "jobId": job_id})
    return JSONResponse(
        status_code=404,
        content={"ok": False, "error": "CANCEL_REJECTED", "message": "Job is not running."},
    )


@router.post(
    "/read-obis-selection/job/{job_id}/skip",
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_read_obis_selection_job_skip(
    job_id: str,
    body: ObisJobSkipBody,
) -> JSONResponse:
    """Skip one still-queued wire row (operator X); does not abort the whole job."""
    ok, code = obis_job_store.skip_queued_row(job_id, body.index)
    if ok:
        return JSONResponse(content={"ok": True, "jobId": job_id, "index": body.index})
    return JSONResponse(
        status_code=400,
        content={"ok": False, "error": code, "message": "Skip not allowed for this row or job."},
    )


@router.post(
    "/relay-read-status",
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_relay_read_status(body: ReadIdentityRequest) -> JSONResponse:
    log.info("http_tcp_listener_relay_read_status", extra={"meter_id": body.meterId})
    envelope = execute_tcp_listener_relay_read_status(body)
    busy = _maybe_session_busy_json(envelope)
    if busy is not None:
        return busy
    return JSONResponse(content=envelope.model_dump(mode="json"))


@router.post(
    "/relay-disconnect",
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_relay_disconnect(body: ReadIdentityRequest) -> JSONResponse:
    log.info("http_tcp_listener_relay_disconnect", extra={"meter_id": body.meterId})
    envelope = execute_tcp_listener_relay_disconnect(body)
    busy = _maybe_session_busy_json(envelope)
    if busy is not None:
        return busy
    return JSONResponse(content=envelope.model_dump(mode="json"))


@router.post(
    "/relay-reconnect",
    dependencies=[Depends(verify_service_token)],
)
def post_tcp_listener_relay_reconnect(body: ReadIdentityRequest) -> JSONResponse:
    log.info("http_tcp_listener_relay_reconnect", extra={"meter_id": body.meterId})
    envelope = execute_tcp_listener_relay_reconnect(body)
    busy = _maybe_session_busy_json(envelope)
    if busy is not None:
        return busy
    return JSONResponse(content=envelope.model_dump(mode="json"))
