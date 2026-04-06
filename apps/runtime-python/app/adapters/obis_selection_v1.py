"""v1 rules for operator OBIS selection reads (Data / Clock / Register, attribute 2 only)."""

from typing import Tuple

from app.schemas.requests import ObisSelectionItem


def obis_selection_item_supported_v1(item: ObisSelectionItem) -> Tuple[bool, str]:
    """
    Returns (True, "") if MVP-AMI run_phase1 multi-read may attempt this row.
    Otherwise (False, machine_reason).
    """
    if item.attribute != 2:
        return False, "OBIS_SELECTION_V1_ATTRIBUTE_NOT_2"

    ot = (item.objectType or "").strip().lower()
    cid = int(item.classId)

    if cid == 7 or ot == "profilegeneric":
        return False, "OBIS_SELECTION_V1_PROFILE_GENERIC_NOT_SUPPORTED"

    if cid == 5 or ot == "demandregister":
        return False, "OBIS_SELECTION_V1_DEMAND_REGISTER_NOT_SUPPORTED"

    if ot == "clock" and cid == 1:
        return True, ""

    if ot == "register" and cid == 3:
        return True, ""

    if ot == "data" and cid == 1:
        return True, ""

    return False, f"OBIS_SELECTION_V1_TYPE_CLASS_UNSUPPORTED:{item.objectType}/{cid}"
