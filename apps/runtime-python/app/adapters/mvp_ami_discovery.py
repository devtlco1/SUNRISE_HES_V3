"""
Association-view discovery: serial + IEC + Gurux association + GET Association LN object list (attr 2).

Uses MVP-AMI `MeterClient` for port open, IEC handshake, and Gurux read helper; uses
`associate_gurux_client_serial` when broadcast SNRM is disabled so a `GXDLMSClient` is available.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, List, Optional

import serial

from app.adapters.mvp_ami_gurux_session import associate_gurux_client_serial
from app.adapters.mvp_ami_shared import MvpAmiBootstrapFailure, mvp_ami_bootstrap
from app.catalog.discovery_normalize import normalize_object_list
from app.config import Settings
from app.schemas.requests import ChannelSpec

log = logging.getLogger(__name__)


@dataclass
class AssociationViewDiscoveryResult:
    ok: bool
    port_used: Optional[str] = None
    diagnostics: List[dict] = field(default_factory=list)
    objects: List[dict] = field(default_factory=list)
    association_ln: str = "0.0.40.0.0.255"
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    gurux_frames_extra: List[dict] = field(default_factory=list)


def run_association_view_discovery(
    settings: Settings,
    channel: Optional[ChannelSpec],
    meter_mod: Any,
    association_ln: str,
) -> AssociationViewDiscoveryResult:
    out = AssociationViewDiscoveryResult(ok=False, association_ln=association_ln.strip() or "0.0.40.0.0.255")
    diags: List[dict] = []

    boot = mvp_ami_bootstrap(settings, channel)
    if isinstance(boot, MvpAmiBootstrapFailure):
        out.error_code = boot.code
        out.error_message = boot.message
        out.diagnostics = [{"stage": "bootstrap", "success": False, "message": boot.message, "details": boot.details or {}}]
        return out

    mc_logger = logging.getLogger("sunrise.mvp_ami.discovery")
    mc_logger.setLevel(settings.log_level.upper())
    mc = meter_mod.MeterClient(boot.app_cfg, mc_logger)

    port_used: Optional[str] = None
    ser: Optional[serial.Serial] = None
    gx_client: Any = None

    try:
        try:
            probe_ser, port_used = mc.open_serial()
            probe_ser.close()
            diags.append(
                {"stage": "open_port", "success": True, "message": "Serial port opened", "details": {"port": port_used}}
            )
        except Exception as exc:  # noqa: BLE001
            diags.append(
                {
                    "stage": "open_port",
                    "success": False,
                    "message": "Failed to open serial port",
                    "details": {"error": str(exc)},
                }
            )
            out.diagnostics = diags
            out.error_code = "SERIAL_OPEN_FAILED"
            out.error_message = str(exc)
            return out

        iec_ok, iec_det, iec_frames = mc._run_iec_handshake(port_used, None)
        diags.append(
            {
                "stage": "initial_request",
                "success": iec_ok,
                "message": "Initial response received" if iec_ok else "No initial response received",
                "details": iec_det,
            }
        )
        if not iec_ok:
            out.diagnostics = diags
            out.port_used = port_used
            out.error_code = "IEC_HANDSHAKE_FAILED"
            out.error_message = "IEC identification / ACK phase did not succeed"
            return out

        time.sleep(float(mc.config.vendor.after_iec_sleep_ms) / 1000.0)

        ser = serial.Serial(port=port_used, **mc._serial_params(mc.config.serial.dlms_baud, iec_mode=False))
        ser.timeout = float(mc.config.vendor.dlms_read_timeout_seconds)

        assoc_ok = False
        assoc_details: dict = {}
        assoc_frames: List[dict] = []

        if mc.config.vendor.use_broadcast_snrm_first:
            b_ok, b_det, b_fr, b_gx = mc._attempt_vendor_broadcast_association(ser)
            assoc_frames.extend(b_fr)
            if b_ok and b_gx is not None:
                assoc_ok = True
                gx_client = b_gx
                assoc_details = b_det

        if gx_client is None:
            ok2, gx2, det2, fr2 = associate_gurux_client_serial(mc, ser)
            assoc_frames.extend(fr2)
            if ok2 and gx2 is not None:
                assoc_ok = True
                gx_client = gx2
                assoc_details = det2
            else:
                assoc_ok = False
                if not assoc_details:
                    assoc_details = det2

        diags.append(
            {
                "stage": "association",
                "success": bool(assoc_ok),
                "message": "Association completed" if assoc_ok else "Association attempt failed",
                "details": assoc_details,
            }
        )
        out.gurux_frames_extra = assoc_frames

        if not assoc_ok or gx_client is None:
            out.diagnostics = diags
            out.port_used = port_used
            out.error_code = "ASSOCIATION_FAILED"
            out.error_message = assoc_details.get("error", "Association failed")
            return out

        from gurux_dlms.objects.GXDLMSAssociationLogicalName import GXDLMSAssociationLogicalName

        assoc_obj = GXDLMSAssociationLogicalName(out.association_ln)
        _, read_err = mc._gurux_read_attribute(ser, gx_client, assoc_obj, 2)

        diags.append(
            {
                "stage": "read_object_list",
                "success": read_err is None,
                "message": "Object list read" if read_err is None else f"Object list read failed: {read_err}",
                "details": {"attributeIndex": 2, "logicalName": out.association_ln},
            }
        )

        if read_err is not None:
            out.diagnostics = diags
            out.port_used = port_used
            out.error_code = "ASSOCIATION_VIEW_READ_FAILED"
            out.error_message = read_err
            return out

        objects = normalize_object_list(assoc_obj.objectList)
        out.objects = objects
        out.ok = True
        out.port_used = port_used
        out.diagnostics = diags
        log.info("association_view_discovery_ok", extra={"count": len(objects), "port": port_used})
        return out

    except Exception as exc:  # noqa: BLE001
        log.exception("association_view_discovery_error")
        out.diagnostics = diags + [
            {"stage": "discovery_runtime", "success": False, "message": str(exc), "details": {}}
        ]
        out.error_code = "DISCOVERY_RUNTIME_ERROR"
        out.error_message = str(exc)
        out.port_used = port_used
        return out
    finally:
        try:
            if gx_client is not None and ser is not None:
                mc._try_gurux_disconnect(ser, gx_client)
        except Exception:  # noqa: BLE001
            pass
        if ser is not None:
            try:
                ser.close()
            except Exception:  # noqa: BLE001
                pass
