"""Canonical serial (OBIS 0.0.96.1.0.255) as the only inbound session routing key."""

from __future__ import annotations

INBOUND_SCANNER_METER_ID = "inbound-scanner"


def normalize_inbound_target_serial(meter_id: str) -> str:
    return (meter_id or "").strip()


def is_scanner_bind_meter_id(meter_id: str) -> bool:
    return normalize_inbound_target_serial(meter_id) == INBOUND_SCANNER_METER_ID
