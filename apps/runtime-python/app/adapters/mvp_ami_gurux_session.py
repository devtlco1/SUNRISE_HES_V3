"""
Gurux HDLC association on an already-open DLMS serial handle.

Mirrors MVP-AMI `MeterClient._attempt_gurux_association` but returns the live
`GXDLMSClient` on success so callers can issue further GETs (e.g. association object-list).

Delegates password/server candidates and framing helpers to a `MeterClient` instance.
"""

from __future__ import annotations

from typing import Any, List, Tuple

import serial


def associate_gurux_client_serial(meter_client: Any, ser: serial.Serial) -> Tuple[bool, Any, dict, List[dict]]:
    """
    Returns (ok, gx_client_or_none, details, frames).
    """
    try:
        from gurux_dlms.GXDLMSClient import GXDLMSClient
        from gurux_dlms.enums.Authentication import Authentication
        from gurux_dlms.enums.InterfaceType import InterfaceType
    except Exception as exc:  # noqa: BLE001
        return False, None, {"error": f"Gurux import failed: {exc}"}, []

    frames: List[dict] = []
    auth = (
        Authentication.LOW
        if str(meter_client.config.dlms.authentication).upper() == "LOW"
        else Authentication.NONE
    )
    attempt_errors: List[dict] = []

    for password in meter_client._password_candidates():
        for server_address in meter_client._server_address_candidates(GXDLMSClient):
            client = None
            try:
                try:
                    client = GXDLMSClient(
                        True,
                        meter_client.config.dlms.client_address,
                        server_address,
                        auth,
                        password,
                        InterfaceType.HDLC,
                    )
                except Exception:
                    client = GXDLMSClient(
                        meter_client.config.dlms.client_address,
                        server_address,
                        auth,
                        password,
                        InterfaceType.HDLC,
                    )
            except Exception as exc:  # noqa: BLE001
                attempt_errors.append(
                    {"password": password, "server_address": server_address, "error": f"client_create: {exc}"}
                )
                continue

            try:
                meter_client._call_if_exists(client, ["setServerAddressSize"], int(meter_client.config.dlms.server_address_size))
                any_rx = False

                snrm = meter_client._get_req_frames(client, ["snrmRequest", "SNRMRequest"])
                for i, frame in enumerate(snrm):
                    tx = meter_client._frameify(frame)
                    ser.write(tx)
                    ser.flush()
                    rx = ser.read(1024)
                    if rx:
                        any_rx = True
                    frames.append(
                        {
                            "stage": f"snrm_{i}",
                            "password": password,
                            "server_address": server_address,
                            "tx_hex": meter_client._hex(tx),
                            "rx_hex": meter_client._hex(rx),
                        }
                    )
                    meter_client._call_if_exists(client, ["parseUAResponse", "ParseUAResponse"], rx)

                aarq = meter_client._get_req_frames(client, ["aarqRequest", "AARQRequest"])
                for i, frame in enumerate(aarq):
                    tx = meter_client._frameify(frame)
                    ser.write(tx)
                    ser.flush()
                    rx = ser.read(1024)
                    if rx:
                        any_rx = True
                    frames.append(
                        {
                            "stage": f"aarq_{i}",
                            "password": password,
                            "server_address": server_address,
                            "tx_hex": meter_client._hex(tx),
                            "rx_hex": meter_client._hex(rx),
                        }
                    )
                    meter_client._call_if_exists(
                        client, ["parseAareResponse", "parseAAREResponse", "ParseAAREResponse"], rx
                    )

                if any_rx:
                    return True, client, {
                        "gurux_client_created": True,
                        "association_rx": True,
                        "client_address": meter_client.config.dlms.client_address,
                        "server_address": int(server_address),
                        "server_address_size": int(meter_client.config.dlms.server_address_size),
                        "meter_address_hex": meter_client.config.dlms.meter_address_hex,
                        "password_used": password,
                        "method": "legacy_snrm_aarq",
                    }, frames

                attempt_errors.append(
                    {"password": password, "server_address": server_address, "error": "no_rx_on_snrm_or_aarq"}
                )
            except Exception as exc:  # noqa: BLE001
                attempt_errors.append({"password": password, "server_address": server_address, "error": str(exc)})

    return False, None, {
        "error": "Association attempts failed.",
        "attempts": attempt_errors,
    }, frames
