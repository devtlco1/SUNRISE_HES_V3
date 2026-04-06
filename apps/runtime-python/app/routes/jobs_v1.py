import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.jobs.local_read_job_queue import (
    JobRecord,
    enqueue_read_basic_registers,
    enqueue_read_identity,
    get_job,
)
from app.jobs.read_job_foundation import ReadJobKind
from app.routes.runtime_v1 import verify_service_token
from app.schemas.jobs import ReadJobEnqueueResponse, ReadJobStatusResponse
from app.schemas.requests import ReadBasicRegistersRequest, ReadIdentityRequest

log = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/jobs", tags=["jobs-v1"])


def _iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _record_to_response(rec: JobRecord) -> ReadJobStatusResponse:
    return ReadJobStatusResponse(
        jobId=rec.job_id,
        kind=rec.kind,
        status=rec.status,
        meterId=rec.meter_id,
        createdAt=_iso_z(rec.created_at),
        startedAt=_iso_z(rec.started_at) if rec.started_at else None,
        finishedAt=_iso_z(rec.finished_at) if rec.finished_at else None,
        result=rec.result,
        error=rec.error,
    )


@router.post(
    "/read-identity",
    response_model=ReadJobEnqueueResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(verify_service_token)],
)
def post_job_read_identity(body: ReadIdentityRequest) -> ReadJobEnqueueResponse:
    rec = enqueue_read_identity(body)
    log.info("http_job_read_identity", extra={"job_id": rec.job_id, "meter_id": body.meterId})
    return ReadJobEnqueueResponse(
        jobId=rec.job_id,
        kind=ReadJobKind.READ_IDENTITY,
        meterId=rec.meter_id,
        createdAt=_iso_z(rec.created_at),
    )


@router.post(
    "/read-basic-registers",
    response_model=ReadJobEnqueueResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(verify_service_token)],
)
def post_job_read_basic_registers(body: ReadBasicRegistersRequest) -> ReadJobEnqueueResponse:
    rec = enqueue_read_basic_registers(body)
    log.info(
        "http_job_read_basic_registers",
        extra={"job_id": rec.job_id, "meter_id": body.meterId},
    )
    return ReadJobEnqueueResponse(
        jobId=rec.job_id,
        kind=ReadJobKind.READ_BASIC_REGISTERS,
        meterId=rec.meter_id,
        createdAt=_iso_z(rec.created_at),
    )


@router.get(
    "/{job_id}",
    response_model=ReadJobStatusResponse,
    dependencies=[Depends(verify_service_token)],
)
def get_job_status(job_id: str) -> ReadJobStatusResponse:
    rec = get_job(job_id)
    if rec is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return _record_to_response(rec)
