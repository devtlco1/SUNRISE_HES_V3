"""
Per-meter relay *command* semantics (COSEM class 70 method indices).

State normalization lives in relay_semantic_profile; this module only selects which
remoteDisconnect/remoteReconnect method index Gurux sends for OFF/ON per meter.

Default matches Blue Book / Gurux: method 1 = remote disconnect, 2 = remote reconnect.
Overrides are explicit JSON per canonical serial — no silent behavior changes.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Optional

from app.config import Settings, get_settings
from app.tcp_listener.inbound_target_serial import normalize_inbound_target_serial

log = logging.getLogger(__name__)

RELAY_COMMAND_PROFILE_STANDARD = "standard"


@dataclass(frozen=True)
class RelayCommandSpec:
    """Resolved command behavior for one meter."""

    command_profile_id: str
    disconnect_method_index: int = 1
    reconnect_method_index: int = 2


def _default_spec() -> RelayCommandSpec:
    return RelayCommandSpec(
        command_profile_id=RELAY_COMMAND_PROFILE_STANDARD,
        disconnect_method_index=1,
        reconnect_method_index=2,
    )


def _parse_command_overrides_json(raw: str) -> dict[str, dict[str, Any]]:
    s = (raw or "").strip()
    if not s:
        return {}
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        log.warning("relay_command_profile_overrides_json_invalid", extra={"snippet": s[:200]})
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for k, v in data.items():
        if isinstance(k, str) and isinstance(v, dict):
            nk = normalize_inbound_target_serial(k) or k.strip()
            out[nk] = v
    return out


def resolve_relay_command_spec(
    meter_serial: str,
    settings: Optional[Settings] = None,
) -> RelayCommandSpec:
    s = settings or get_settings()
    key = normalize_inbound_target_serial(meter_serial) or (meter_serial or "").strip()
    overrides = _parse_command_overrides_json(
        getattr(s, "relay_command_profile_overrides_json", "{}")
    )
    base = _default_spec()
    default_id = getattr(s, "relay_command_profile_default", RELAY_COMMAND_PROFILE_STANDARD)
    default_id = (default_id or RELAY_COMMAND_PROFILE_STANDARD).strip()

    o = overrides.get(key)
    if not o:
        return RelayCommandSpec(
            command_profile_id=default_id,
            disconnect_method_index=base.disconnect_method_index,
            reconnect_method_index=base.reconnect_method_index,
        )

    pid = str(o.get("commandProfileId") or o.get("command_profile_id") or default_id).strip()
    disc = o.get("disconnectMethodIndex", o.get("disconnect_method_index", base.disconnect_method_index))
    recon = o.get("reconnectMethodIndex", o.get("reconnect_method_index", base.reconnect_method_index))
    try:
        di = int(disc)
        ri = int(recon)
    except (TypeError, ValueError):
        log.warning(
            "relay_command_override_invalid_indices",
            extra={"meter_serial": key, "disconnect": disc, "reconnect": recon},
        )
        return RelayCommandSpec(
            command_profile_id=pid or default_id,
            disconnect_method_index=base.disconnect_method_index,
            reconnect_method_index=base.reconnect_method_index,
        )

    for name, idx in (("disconnect", di), ("reconnect", ri)):
        if idx < 1 or idx > 4:
            log.warning(
                "relay_command_override_index_unusual",
                extra={"meter_serial": key, "which": name, "method_index": idx},
            )

    return RelayCommandSpec(
        command_profile_id=pid or RELAY_COMMAND_PROFILE_STANDARD,
        disconnect_method_index=di,
        reconnect_method_index=ri,
    )


def method_index_for_operation(spec: RelayCommandSpec, operation: str) -> int:
    if operation == "relayDisconnect":
        return spec.disconnect_method_index
    if operation == "relayReconnect":
        return spec.reconnect_method_index
    raise ValueError(f"unsupported relay operation {operation!r}")


def build_relay_readback_analysis(
    *,
    expected_state: str,
    pre_normalized: Optional[str],
    post_normalized: str,
    method_dlms_layer_ok: bool,
    post_read_error: Optional[str],
) -> dict[str, Any]:
    """
    Classify command vs readback for operator diagnostics (does not change verifiedOnWire).
    """
    out: dict[str, Any] = {
        "expectedStateAfterCommand": expected_state,
        "postCommandNormalizedState": post_normalized,
        "methodDlmsLayerOk": method_dlms_layer_ok,
        "postCommandReadError": post_read_error,
    }
    if pre_normalized is not None:
        out["preCommandNormalizedState"] = pre_normalized
        out["readbackChangedVersusBaseline"] = pre_normalized != post_normalized
        if method_dlms_layer_ok and pre_normalized == post_normalized:
            out["suspectedNoMeterStateChange"] = True
        else:
            out["suspectedNoMeterStateChange"] = False
    else:
        out["readbackChangedVersusBaseline"] = None
        out["suspectedNoMeterStateChange"] = None
    if post_read_error:
        out["failureMode"] = "post_disconnect_control_read_failed"
    elif not method_dlms_layer_ok:
        out["failureMode"] = "dlms_method_rejected_or_incomplete"
    elif post_normalized != expected_state:
        if out.get("suspectedNoMeterStateChange"):
            out["failureMode"] = "dlms_ok_but_meter_state_unchanged_mismatch_expected"
        else:
            out["failureMode"] = "dlms_ok_but_readback_mismatch_expected"
    else:
        out["failureMode"] = "ok"
    return out
