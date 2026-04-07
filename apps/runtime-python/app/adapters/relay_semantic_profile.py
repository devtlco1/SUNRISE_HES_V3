"""
Per-meter relay *state read* semantics for class 70 (outputState / controlState normalization).

This is separate from relay *command* profiles (which COSEM method index is sent for OFF/ON);
see app.adapters.relay_command_profile.

Different devices report different combinations after remote disconnect/reconnect (e.g. Gurux
ControlState READY_FOR_RECONNECTION=2 with outputState=false). Optional state profiles apply
per canonical serial. If live evidence shows DLMS method succeeds but the load does not switch,
investigate command profiles and raw method replies — not only state tuple mapping.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, Optional

from app.config import Settings, get_settings
from app.tcp_listener.inbound_target_serial import normalize_inbound_target_serial

log = logging.getLogger(__name__)

# Built-in profile ids (env JSON must use these strings).
RELAY_PROFILE_STANDARD = "standard"
"""
Default: outputState bool wins when present; else controlState 1=on, 0 and 2=off (Gurux enum).
Matches behavior before relay profiles existed.
"""

RELAY_PROFILE_RCS_OUTPUT_FALSE_CS2_AS_ON = "rcs_output_false_cs2_as_on"
"""
Some meters after remote reconnect report outputState=false with controlState=2 (READY_FOR_RECONNECTION)
while the operator considers the service reconnected. Use only for serials where this was validated;
maps (False, 2) -> normalized on. All other tuples use the same rules as *standard*.
"""


@dataclass(frozen=True)
class RelayProfileSpec:
    profile_id: str
    description: str


KNOWN_PROFILES: dict[str, RelayProfileSpec] = {
    RELAY_PROFILE_STANDARD: RelayProfileSpec(
        profile_id=RELAY_PROFILE_STANDARD,
        description="outputState bool primary; else controlState 0/2=off, 1=on",
    ),
    RELAY_PROFILE_RCS_OUTPUT_FALSE_CS2_AS_ON: RelayProfileSpec(
        profile_id=RELAY_PROFILE_RCS_OUTPUT_FALSE_CS2_AS_ON,
        description="Like standard, but outputState=false + controlState=2 => on (device-specific)",
    ),
}


def _parse_overrides_json(raw: str) -> dict[str, str]:
    s = (raw or "").strip()
    if not s:
        return {}
    try:
        data = json.loads(s)
    except json.JSONDecodeError:
        log.warning("relay_profile_overrides_json_invalid", extra={"snippet": s[:200]})
        return {}
    if not isinstance(data, dict):
        return {}
    out: dict[str, str] = {}
    for k, v in data.items():
        if isinstance(k, str) and isinstance(v, str):
            nk = normalize_inbound_target_serial(k) or k.strip()
            out[nk] = v.strip()
    return out


def resolve_relay_profile_id(meter_serial: str, settings: Optional[Settings] = None) -> str:
    s = settings or get_settings()
    key = normalize_inbound_target_serial(meter_serial) or (meter_serial or "").strip()
    overrides = _parse_overrides_json(getattr(s, "relay_profile_overrides_json", "{}"))
    pid = overrides.get(key) or getattr(s, "relay_profile_default", RELAY_PROFILE_STANDARD)
    pid = (pid or RELAY_PROFILE_STANDARD).strip()
    if pid not in KNOWN_PROFILES:
        log.warning(
            "relay_profile_unknown_fallback_standard",
            extra={"requested_profile": pid, "meter_serial": key},
        )
        return RELAY_PROFILE_STANDARD
    return pid


def _legacy_parse_relay_state_from_row(row: dict) -> str:
    """Local copy of generic row parse — only used when strategy != disconnect_control."""
    if row.get("error"):
        return "unknown"
    v = row.get("value")
    vs = str(row.get("value_str") or "").strip().lower()
    if isinstance(v, bool):
        return "on" if v else "off"
    if vs in ("true", "false"):
        return "on" if vs == "true" else "off"
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        vi = int(v)
        if vi == 2:
            return "on"
        if vi == 1:
            return "off"
        if vi == 0:
            return "off"
    if "disconnect" in vs or vs in ("off", "open"):
        return "off"
    if "connect" in vs or vs in ("on", "closed", "close"):
        return "on"
    if vs in ("1", "2", "0"):
        return _legacy_parse_relay_state_from_row({"value": int(vs), "value_str": "", "error": None})
    return "unknown"


def normalize_relay_disconnect_control_row(
    row: dict[str, Any],
    *,
    profile_id: str,
    meter_serial: str,
) -> tuple[str, str, dict[str, Any]]:
    """
    Returns (normalized_state, raw_display, relay_diagnostics).

    relay_diagnostics is JSON-serializable and safe to attach to operator payloads.
    """
    ln = str(row.get("logical_name") or "")
    out_b = row.get("output_state")
    cs_val = row.get("control_state")
    cs_int: Optional[int] = None
    if cs_val is not None and isinstance(cs_val, (int, float)) and not isinstance(cs_val, bool):
        cs_int = int(cs_val)

    err = row.get("error")
    diag: dict[str, Any] = {
        "targetMeterSerial": (meter_serial or "").strip(),
        "relayProfileId": profile_id,
        "logicalName": ln or None,
        "disconnectControlReadError": err,
        "outputStateBool": out_b if isinstance(out_b, bool) else None,
        "controlStateInt": cs_int,
        "attr2Ok": row.get("attr2_ok"),
        "attr3Ok": row.get("attr3_ok"),
        "attr2Err": row.get("attr2_err"),
        "attr3Err": row.get("attr3_err"),
    }

    if err:
        diag["interpretationRule"] = "read_error"
        diag["normalizedRelayState"] = "unknown"
        raw = "; ".join(
            x
            for x in (
                f"outputState={out_b!r}" if out_b is not None else None,
                f"controlState={cs_int!r}" if cs_int is not None else None,
                f"error={err!r}",
            )
            if x
        )
        return "unknown", raw, diag

    interpretation = "unknown"
    state = "unknown"

    # Profile-specific: (False, 2) => on — before generic bool short-circuit.
    if (
        profile_id == RELAY_PROFILE_RCS_OUTPUT_FALSE_CS2_AS_ON
        and isinstance(out_b, bool)
        and out_b is False
        and cs_int == 2
    ):
        state = "on"
        interpretation = "profile_output_false_control_state_2_as_on"
    elif isinstance(out_b, bool):
        state = "on" if out_b else "off"
        interpretation = "output_state_bool"
    elif cs_int is not None:
        if cs_int == 1:
            state = "on"
            interpretation = "control_state_enum_1_connected"
        elif cs_int in (0, 2):
            state = "off"
            interpretation = (
                "control_state_enum_0_or_2_disconnected_or_ready_for_reconnection"
            )
        else:
            state = _legacy_parse_relay_state_from_row(row)
            interpretation = "fallback_legacy_parse"
    else:
        state = _legacy_parse_relay_state_from_row(row)
        interpretation = "fallback_legacy_parse_no_bool_no_cs"

    diag["interpretationRule"] = interpretation
    diag["normalizedRelayState"] = state
    diag["verifiedAgainstExpectedHint"] = None

    parts: list[str] = []
    if isinstance(out_b, bool):
        parts.append(f"outputState={out_b!r}")
    if cs_int is not None:
        parts.append(f"controlState={cs_int!r}")
    raw = "; ".join(parts) or str(row.get("value_str") or row.get("value") or "")

    return state, raw, diag


def relay_diagnostics_for_command_verify(
    diag: dict[str, Any],
    *,
    expected_state: str,
    verified: bool,
    detail_code: str,
    operation: str,
    method_index: Optional[int],
    method_detail: Optional[str] = None,
) -> dict[str, Any]:
    """Merge command context into a copy for payloads / logs."""
    out = dict(diag)
    out["expectedRelayState"] = expected_state
    out["verifiedOnWire"] = verified
    out["detailCode"] = detail_code
    out["relayOperation"] = operation
    out["relayMethodIndex"] = method_index
    if method_detail is not None:
        out["methodResultDetail"] = (method_detail or "")[:500]
    disagree = (
        out.get("normalizedRelayState") is not None
        and expected_state != "unknown"
        and out.get("normalizedRelayState") != expected_state
    )
    out["verificationDisagreesWithExpected"] = bool(disagree)
    return out
