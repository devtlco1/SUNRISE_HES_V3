"""
Serial / host-initiated reads via MVP-AMI `MeterClient.run_phase1`.

Requires a local checkout of https://github.com/devtlco1/MVP-AMI and a valid MVP-AMI `config.json`
(see `SUNRISE_RUNTIME_MVP_AMI_CONFIG_PATH` or `<root>/config.json`).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, List, Optional, Union

from app.adapters.base import ProtocolRuntimeAdapter
from app.adapters.mvp_ami_discovery import run_association_view_discovery
from app.adapters.mvp_ami_shared import (
    MvpAmiBootstrapFailure,
    diagnostic_dump,
    find_stage,
    mvp_ami_bootstrap,
)
from app.config import get_settings
from app.schemas.envelope import (
    BasicRegisterReading,
    BasicRegistersPayload,
    DiscoveredObjectRow,
    DiscoverSupportedObisPayload,
    IdentityPayload,
    RuntimeCapabilityStage,
    RuntimeErrorInfo,
    RuntimeExecutionDiagnostics,
    RuntimeOperation,
    RuntimeResponseEnvelope,
)
from app.schemas.requests import (
    DiscoverSupportedObisRequest,
    ReadBasicRegistersRequest,
    ReadIdentityRequest,
)

log = logging.getLogger(__name__)


def _iso_z(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def _failure_envelope(
    *,
    meter_id: str,
    operation: RuntimeOperation,
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
    capability_stage: RuntimeCapabilityStage = "cosem_read",
) -> RuntimeResponseEnvelope:
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    return RuntimeResponseEnvelope(
        ok=False,
        simulated=False,
        operation=operation,
        meterId=meter_id,
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
            capabilityStage=capability_stage,
            transportAttempted=transport_attempted,
            associationAttempted=association_attempted,
            verifiedOnWire=verified,
            detailCode=detail_code,
        ),
    )


def _success_envelope(
    *,
    meter_id: str,
    operation: RuntimeOperation,
    started: datetime,
    finished: datetime,
    payload: Union[IdentityPayload, BasicRegistersPayload, DiscoverSupportedObisPayload],
    message: str,
    transport_attempted: bool,
    association_attempted: bool,
    verified: bool,
    detail_code: Optional[str],
    outcome_override: Optional[str] = None,
    capability_stage: RuntimeCapabilityStage = "cosem_read",
) -> RuntimeResponseEnvelope:
    duration_ms = max(1, int((finished - started).total_seconds() * 1000))
    out = outcome_override or ("verified_on_wire_success" if verified else "attempted_failed")
    return RuntimeResponseEnvelope(
        ok=True,
        simulated=False,
        operation=operation,
        meterId=meter_id,
        startedAt=_iso_z(started),
        finishedAt=_iso_z(finished),
        durationMs=duration_ms,
        message=message,
        transportState="disconnected",
        associationState="associated" if association_attempted else "none",
        payload=payload,
        error=None,
        diagnostics=RuntimeExecutionDiagnostics(
            outcome=out,  # type: ignore[arg-type]
            capabilityStage=capability_stage,
            transportAttempted=transport_attempted,
            associationAttempted=association_attempted,
            verifiedOnWire=verified,
            detailCode=detail_code,
        ),
    )


def _identity_payload_from_obis_row(obis: str, row: dict) -> IdentityPayload:
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


def _register_reading_from_row(row: dict) -> tuple[bool, BasicRegisterReading]:
    read_err = row.get("error")
    disp = (row.get("value_str") or "").strip()
    val = row.get("value")
    value_str = disp or (str(val) if val is not None else "")
    unit = row.get("unit")
    if isinstance(unit, str):
        u = unit.strip() or None
    else:
        u = None
    if read_err is not None or not value_str:
        return False, BasicRegisterReading(
            value="",
            unit=u,
            quality="error",
            error=str(read_err) if read_err is not None else "no value",
        )
    return True, BasicRegisterReading(value=value_str, unit=u, quality="good")


def _obis_list_from_settings(raw: str) -> List[str]:
    parts = [x.strip() for x in (raw or "").split(",") if x.strip()]
    return parts


def _early_transport_failures(
    *,
    meter_id: str,
    operation: RuntimeOperation,
    started: datetime,
    finished: datetime,
    diags: List[Any],
) -> Optional[RuntimeResponseEnvelope]:
    open_d = find_stage(diags, "open_port")
    assoc_d = find_stage(diags, "association")
    init_d = find_stage(diags, "initial_request")
    diag_dump = diagnostic_dump(diags)
    transport_ok = bool(open_d and open_d.success)

    if not transport_ok:
        return _failure_envelope(
            meter_id=meter_id,
            operation=operation,
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
            meter_id=meter_id,
            operation=operation,
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
        cancel_d = find_stage(diags, "cancelled")
        if cancel_d is not None:
            return _failure_envelope(
                meter_id=meter_id,
                operation=operation,
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
            meter_id=meter_id,
            operation=operation,
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

    if not assoc_d.success:
        return _failure_envelope(
            meter_id=meter_id,
            operation=operation,
            started=started,
            finished=finished,
            message="DLMS association did not complete successfully (see diagnostics).",
            code="ASSOCIATION_FAILED",
            transport_state="disconnected",
            association_state="failed",
            transport_attempted=True,
            association_attempted=True,
            verified=False,
            outcome="attempted_failed",
            detail_code="ASSOCIATION_FAILED",
            err_details={"mvpAmiDiagnostics": diag_dump, "association": getattr(assoc_d, "details", {})},
        )

    return None


class MvpAmiRuntimeAdapter(ProtocolRuntimeAdapter):
    def read_identity(self, request: ReadIdentityRequest) -> RuntimeResponseEnvelope:
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, request.channel)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details=boot.details,
            )

        obis = settings.identity_obis.strip() or "0.0.96.1.1.255"

        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
            result = client.run_phase1(obis_list=[obis])
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_run_phase1_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
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
        early = _early_transport_failures(
            meter_id=request.meterId,
            operation="readIdentity",
            started=started,
            finished=finished,
            diags=diags,
        )
        if early is not None:
            return early

        read_d = find_stage(diags, "read_obis")
        diag_dump = diagnostic_dump(diags)
        assoc_d = find_stage(diags, "association")
        assoc_ok = bool(assoc_d and assoc_d.success)

        row = (result.parsed_values or {}).get(obis) or {}
        read_err = row.get("error")
        has_value = row.get("value") is not None or bool((row.get("value_str") or "").strip())
        read_ok = read_err is None and has_value

        if not read_ok:
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readIdentity",
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
            getattr(boot.app_cfg, "serial", None), "port_primary", None
        )

        return _success_envelope(
            meter_id=request.meterId,
            operation="readIdentity",
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

    def read_basic_registers(self, request: ReadBasicRegistersRequest) -> RuntimeResponseEnvelope:
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, request.channel)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details=boot.details,
            )

        obis_list = _obis_list_from_settings(settings.basic_registers_obis)
        if not obis_list:
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message="No OBIS configured for basic registers (SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS).",
                code="BASIC_REGISTERS_OBIS_EMPTY",
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code="BASIC_REGISTERS_OBIS_EMPTY",
            )

        mc_logger = logging.getLogger("sunrise.mvp_ami.meter_client")
        mc_logger.setLevel(settings.log_level.upper())

        try:
            client = boot.meter_mod.MeterClient(boot.app_cfg, mc_logger)
            result = client.run_phase1(obis_list=obis_list)
        except Exception as exc:  # noqa: BLE001
            log.exception("mvp_ami_run_phase1_basic_registers_failed")
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
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
        early = _early_transport_failures(
            meter_id=request.meterId,
            operation="readBasicRegisters",
            started=started,
            finished=finished,
            diags=diags,
        )
        if early is not None:
            return early

        read_d = find_stage(diags, "read_obis")
        diag_dump = diagnostic_dump(diags)
        parsed = result.parsed_values or {}

        registers: dict[str, BasicRegisterReading] = {}
        ok_count = 0
        for obis in obis_list:
            row = parsed.get(obis) or {}
            ok, reading = _register_reading_from_row(row if isinstance(row, dict) else {})
            registers[obis] = reading
            if ok:
                ok_count += 1

        port_ref = getattr(result, "port_used", None) or getattr(
            getattr(boot.app_cfg, "serial", None), "port_primary", None
        )

        if ok_count == 0:
            return _failure_envelope(
                meter_id=request.meterId,
                operation="readBasicRegisters",
                started=started,
                finished=finished,
                message="All configured basic-register OBIS reads failed after successful association.",
                code="BASIC_REGISTERS_ALL_FAILED",
                transport_state="disconnected",
                association_state="associated",
                transport_attempted=True,
                association_attempted=True,
                verified=False,
                outcome="attempted_failed",
                detail_code="BASIC_REGISTERS_ALL_FAILED",
                err_details={
                    "obisList": obis_list,
                    "registers": {k: v.model_dump() for k, v in registers.items()},
                    "mvpAmiDiagnostics": diag_dump,
                    "readObis": getattr(read_d, "__dict__", {}) if read_d else None,
                },
            )

        partial = ok_count < len(obis_list)
        verified = ok_count > 0
        detail = "MVP_AMI_BASIC_REGISTERS_PARTIAL" if partial else "MVP_AMI_BASIC_REGISTERS_OK"
        msg = (
            f"Basic registers via MVP-AMI serial (port={port_ref!r}): "
            f"{ok_count}/{len(obis_list)} OBIS succeeded"
            + ("; see per-OBIS `error` fields in payload for failures." if partial else ".")
        )

        return _success_envelope(
            meter_id=request.meterId,
            operation="readBasicRegisters",
            started=started,
            finished=finished,
            payload=BasicRegistersPayload(registers=registers),
            message=msg,
            transport_attempted=True,
            association_attempted=True,
            verified=verified,
            detail_code=detail,
            outcome_override="verified_on_wire_success" if verified else "attempted_failed",
        )

    def discover_supported_obis(self, request: DiscoverSupportedObisRequest) -> RuntimeResponseEnvelope:
        settings = get_settings()
        started = datetime.now(timezone.utc)

        boot = mvp_ami_bootstrap(settings, request.channel)
        if isinstance(boot, MvpAmiBootstrapFailure):
            finished = datetime.now(timezone.utc)
            return _failure_envelope(
                meter_id=request.meterId,
                operation="discoverSupportedObis",
                started=started,
                finished=finished,
                message=boot.message,
                code=boot.code,
                transport_state="disconnected",
                association_state="none",
                transport_attempted=False,
                association_attempted=False,
                verified=False,
                outcome="attempted_failed",
                detail_code=boot.code,
                err_details=boot.details,
                capability_stage="object_discovery",
            )

        assoc_ln = (settings.discovery_association_ln or "").strip() or "0.0.40.0.0.255"
        disc = run_association_view_discovery(settings, request.channel, boot.meter_mod, assoc_ln)
        finished = datetime.now(timezone.utc)

        if not disc.ok:
            transport_attempted = any(d.get("stage") == "open_port" and d.get("success") for d in disc.diagnostics)
            assoc_attempted = any(d.get("stage") == "association" for d in disc.diagnostics)
            ec = disc.error_code or "DISCOVERY_FAILED"
            if ec == "ASSOCIATION_VIEW_READ_FAILED":
                assoc_state = "associated"
            elif ec in ("SERIAL_OPEN_FAILED", "IEC_HANDSHAKE_FAILED", "MVP_AMI_ROOT_REQUIRED"):
                assoc_state = "none"
            else:
                assoc_state = "failed"
            return _failure_envelope(
                meter_id=request.meterId,
                operation="discoverSupportedObis",
                started=started,
                finished=finished,
                message=disc.error_message or "Association view discovery failed.",
                code=ec,
                transport_state="error" if disc.error_code == "SERIAL_OPEN_FAILED" else "disconnected",
                association_state=assoc_state,  # type: ignore[arg-type]
                transport_attempted=transport_attempted,
                association_attempted=assoc_attempted,
                verified=False,
                outcome="attempted_failed",
                detail_code=disc.error_code or "DISCOVERY_FAILED",
                err_details={
                    "sunDiscoveryDiagnostics": disc.diagnostics,
                    "guruxFrameCount": len(disc.gurux_frames_extra),
                    "associationLogicalName": assoc_ln,
                },
                capability_stage="object_discovery",
            )

        rows: List[DiscoveredObjectRow] = []
        for o in disc.objects:
            try:
                rows.append(DiscoveredObjectRow.model_validate(o))
            except Exception:  # noqa: BLE001
                rows.append(
                    DiscoveredObjectRow(
                        classId=int(o.get("classId", -1)) if isinstance(o, dict) else -1,
                        obis=str(o.get("obis", "")) if isinstance(o, dict) else "",
                        version=int(o.get("version", 0)) if isinstance(o, dict) else 0,
                        error="row_validate_failed",
                    )
                )

        payload = DiscoverSupportedObisPayload(
            associationLogicalName=assoc_ln,
            totalCount=len(rows),
            objects=rows,
        )
        port_ref = disc.port_used
        verified = True
        return _success_envelope(
            meter_id=request.meterId,
            operation="discoverSupportedObis",
            started=started,
            finished=finished,
            payload=payload,
            message=(
                f"Association object list read via Gurux (LN={assoc_ln!r}, port={port_ref!r}, "
                f"objects={len(rows)}, verifiedOnWire=True)."
            ),
            transport_attempted=True,
            association_attempted=True,
            verified=verified,
            detail_code="MVP_AMI_DISCOVERY_OK",
            capability_stage="object_discovery",
        )
