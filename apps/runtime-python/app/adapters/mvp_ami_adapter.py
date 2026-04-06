"""
Serial / host-initiated identity read via MVP-AMI `MeterClient.run_phase1`.

Requires a local checkout of https://github.com/devtlco1/MVP-AMI and a valid MVP-AMI `config.json`
(see `SUNRISE_RUNTIME_MVP_AMI_CONFIG_PATH` or `<root>/config.json`).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, List, Optional

from app.adapters.base import ProtocolRuntimeAdapter
from app.adapters.mvp_ami_bridge import load_mvp_ami_modules
from app.config import get_settings
from app.schemas.envelope import (
    IdentityPayload,
    RuntimeErrorInfo,
    RuntimeExecutionDiagnostics,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import ReadIdentityRequest

log = logging.getLogger(__name__)


def _iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _find_stage(diags: List[Any], stage: str) -> Any:
    for d in diags:
        if getattr(d, "stage", None) == stage:
            return d
    return None


def _failure_envelope(
    *,
    request: ReadIdentityRequest,
    started: datetime,
    finished: datetime,
    message: str,
    code: str,
    transport_state: str,
    association_state: str,
    transport_attempted: bool,
    association_attempted: bool,
    verified: bool,
    outcome: str,
    detail_code: str,
    err_details: Optional[dict] = None,
) -> RuntimeResponseEnvelope:
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    return RuntimeResponseEnvelope(
        ok=False,
        simulated=False,
        operation="readIdentity",
        meterId=request.meterId,
        startedAt=_iso_z(started),
        finishedAt=_iso_z(finished),
        durationMs=duration_ms,
        message=message,
        transportState=transport_state,  # type: ignore[arg-type]
        associationState=association_state,  # type: ignore[arg-type]
        payload=None,
        error=RuntimeErrorInfo(code=code, message=message, details=err_details),
        diagnostics=RuntimeExecutionDiagnostics(
            outcome=outcome,  # type: ignore[arg-type]
            capabilityStage="cosem_read",
            transportAttempted=transport_attempted,
            associationAttempted=association_attempted,
            verifiedOnWire=verified,
            detailCode=detail_code,
        ),
    )


def _success_envelope(
    *,
    request: ReadIdentityRequest,
    started: datetime,
    finished: datetime,
    payload: IdentityPayload,
    message: str,
    transport_attempted: bool,
    association_attempted: bool,
    verified: bool,
    detail_code: Optional[str],
) -> RuntimeResponseEnvelope:
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    return RuntimeResponseEnvelope(
        ok=True,
        simulated=False,
        operation="readIdentity",
        meterId=request.meterId,
        startedAt=_iso_z(started),
        finishedAt=_iso_z(finished),
        durationMs=duration_ms,
        message=message,
        transportState="disconnected",
        associationState="associated" if association_attempted else "none",
        payload=payload,
        error=None,
        diagnostics=RuntimeExecutionDiagnostics(
            outcome="verified_on_wire_success" if verified else "attempted_failed",
            capabilityStage="cosem_read",
            transportAttempted=transport_attempted,
            associationAttempted=association_attempted,
            verifiedOnWire=verified,
            detailCode=detail_code,
        ),
    )


def _identity_payload_from_obis_row(obis: str, row: dict) -> IdentityPayload:
    """Map one COSEM read row to `IdentityPayload` without inventing extra OBIS reads."""
    disp = (row.get("value_str") or "").strip()
    val = row.get("value")
    primary = disp or (str(val) if val is not None else "")
    if not primary:
        primary = "unknown"
    return IdentityPayload(
        serialNumber=primary,
        manufacturer="unknown",
        model="unknown",
        firmwareVersion="unknown",
        protocolVersion="DLMS/Gurux (MVP-AMI MeterClient)",
        logicalDeviceName=primary if primary != "unknown" else None,
    )


class MvpAmiRuntimeAdapter(ProtocolRuntimeAdapter):
    def read_identity(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        settings = get_settings()
        started = datetime.now(timezone.utc)

        root = (settings.mvp_ami_root or "").strip()
        if not root:
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message="Set SUNRISE_RUNTIME_MVP_AMI_ROOT to a local MVP-AMI repository path.",
                code="MVP_AMI_ROOT_REQUIRED",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_ROOT_REQUIRED",
            )

        cfg_path = settings.mvp_ami_config_path or ""
        if not cfg_path.strip():
            cfg_path = str(Path(root) / "config.json")
        cfg_path = str(Path(cfg_path).expanduser().resolve())

        if not Path(cfg_path).is_file():
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message=f"MVP-AMI config file not found: {cfg_path}",
                code="MVP_AMI_CONFIG_MISSING",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_CONFIG_MISSING",
                err_details={"configPath": cfg_path},
            )

        try:
            config_mod, meter_mod = load_mvp_ami_modules(root)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_import_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message=f"Failed to import MVP-AMI modules from {root}: {exc}",
                code="MVP_AMI_IMPORT_FAILED",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_IMPORT_FAILED",
                err_details={"mvpAmiRoot": root, "error": str(exc)},
            )

        load_config = getattr(config_mod, "load_config", None)
        if load_config is None:
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message="MVP-AMI config module has no load_config().",
                code="MVP_AMI_CONFIG_API_UNEXPECTED",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_CONFIG_API_UNEXPECTED",
            )

        try:
            app_cfg = load_config(cfg_path)
        except Exception as exc:  # noqa: BLE001
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message=f"Invalid or unreadable MVP-AMI config: {exc}",
                code="MVP_AMI_CONFIG_LOAD_FAILED",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_CONFIG_LOAD_FAILED",
                err_details={"configPath": cfg_path, "error": str(exc)},
            )

        if request.channel and request.channel.type == "serial" and request.channel.devicePath:
            app_cfg.serial.port_primary = request.channel.devicePath.strip()
            log.info("serial_override_from_request", extra={"port": app_cfg.serial.port_primary})

        obis = settings.identity_obis.strip() or "0.0.96.1.1.255"

        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = meter_mod.MeterClient(app_cfg, mc_logger)
            result = client.run_phase1(obis_list=[obis])
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_run_phase1_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message=f"MVP-AMI run_phase1 raised: {exc}",
                code="MVP_AMI_RUNTIME_ERROR",
                transport_state="error",
                association_state="failed",
                transport_attempted=True,
                association_attempted=True,
                verified=False,
                outcome="attempted_failed",
                detail_code="MVP_AMI_RUNTIME_ERROR",
                err_details={"error": str(exc)},
            )

        finished = datetime.now(timezone.utc)
        diags = result.diagnostics or []
        open_d = _find_stage(diags, "open_port")
        assoc_d = _find_stage(diags, "association")
        read_d = _find_stage(diags, "read_obis")

        transport_ok = bool(open_d and open_d.success)
        assoc_ok = bool(assoc_d and assoc_d.success)
        assoc_attempted = assoc_d is not None

        init_d = _find_stage(diags, "initial_request")

        diag_dump = [
            {
                "stage": getattr(d, "stage", ""),
                "success": bool(getattr(d, "success", False)),
                "message": getattr(d, "message", ""),
                "details": getattr(d, "details", {}) or {},
            }
            for d in diags
        ]

        if not transport_ok:
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message="Serial port did not open (see diagnostics).",
                code="SERIAL_OPEN_FAILED",
                transport_state="error",
                association_state="none",
                transport_attempted=open_d is not None,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="SERIAL_OPEN_FAILED",
                err_details={"mvpAmiDiagnostics": diag_dump},
            )

        if init_d is not None and not init_d.success:
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message="IEC identification / ACK phase did not succeed (MVP-AMI initial_request).",
                code="IEC_HANDSHAKE_FAILED",
                transport_state="error",
                association_state="none",
                transport_attempted=True,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="IEC_HANDSHAKE_FAILED",
                err_details={"mvpAmiDiagnostics": diag_dump},
            )

        if assoc_d is None:
            cancel_d = _find_stage(diags, "cancelled")
            if cancel_d is not None:
                return _failure_envelope(
                    request=request,
                    started=started,
                    finished=finished,
                    message="MVP-AMI read was cancelled before association completed.",
                    code="MVP_AMI_CANCELLED",
                    transport_state="disconnected",
                    association_state="none",
                    transport_attempted=True,
                    association_attempted=False,
                    verified=False,
                    outcome="attempted_failed",
                    detail_code="MVP_AMI_CANCELLED",
                    err_details={"mvpAmiDiagnostics": diag_dump},
                )
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message="Association stage did not run (unexpected MVP-AMI pipeline state).",
                code="ASSOCIATION_NOT_REACHED",
                transport_state="error",
                association_state="none",
                transport_attempted=True,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="ASSOCIATION_NOT_REACHED",
                err_details={"mvpAmiDiagnostics": diag_dump},
            )

        row = (result.parsed_values or {}).get(obis) or {}
        read_err = row.get("error")
        has_value = row.get("value") is not None or bool((row.get("value_str") or "").strip())
        read_ok = read_err is None and has_value

        if not assoc_ok:
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message="DLMS association did not complete successfully (see diagnostics).",
                code="ASSOCIATION_FAILED",
                transport_state="disconnected",
                association_state="failed",
                transport_attempted=True,
                association_attempted=assoc_attempted,
                verified=False,
                outcome="attempted_failed",
                detail_code="ASSOCIATION_FAILED",
                err_details={"mvpAmiDiagnostics": diag_dump, "association": getattr(assoc_d, "details", {})},
            )

        if not read_ok:
            return _failure_envelope(
                request=request,
                started=started,
                finished=finished,
                message=f"Identity OBIS read failed for {obis!r}: {read_err or 'no value'}",
                code="IDENTITY_READ_FAILED",
                transport_state="disconnected",
                association_state="associated",
                transport_attempted=True,
                association_attempted=True,
                verified=False,
                outcome="attempted_failed",
                detail_code="IDENTITY_OBIS_FAILED",
                err_details={
                    "obis": obis,
                    "row": row,
                    "mvpAmiDiagnostics": diag_dump,
                    "readObis": getattr(read_d, "__dict__", {}) if read_d else None,
                },
            )

        payload = _identity_payload_from_obis_row(obis, row)
        verified = bool(assoc_ok and read_ok)
        port_ref = getattr(result, "port_used", None) or getattr(
            getattr(app_cfg, "serial", None), "port_primary", None
        )

        return _success_envelope(
            request=request,
            started=started,
            finished=finished,
            payload=payload,
            message=(
                f"Identity OBIS {obis} read via MVP-AMI serial path "
                f"(port={port_ref!r}, verifiedOnWire={verified})."
            ),
            transport_attempted=True,
            association_attempted=True,
            verified=verified,
            detail_code="MVP_AMI_IDENTITY_OK",
        )
