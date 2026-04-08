/**
 * Map vendor PRM_CODE_OBIS DataType / AnalyticType + logical OBIS to COSEM class/object_type
 * for MVP-AMI read-obis-selection payloads. Heuristic — adjust mapping table as vendor docs evolve.
 */

export function inferDlmsFromPrm(params: {
  obisLogical: string
  dataType: string
  analyticType: string
}): { object_type: string; class_id: number } {
  const dt = params.dataType.trim()
  const at = params.analyticType.trim().toUpperCase()
  if (at === "DATETIME" || at === "DATE" || dt === "25") {
    return { object_type: "clock", class_id: 1 }
  }
  const parts = params.obisLogical.split(".").map((x) => Number(x))
  if (parts.length === 6 && parts[0] === 0 && parts[2] === 1) {
    return { object_type: "clock", class_id: 1 }
  }
  if (parts.length === 6 && parts[0] >= 1 && parts[0] <= 4) {
    return { object_type: "register", class_id: 3 }
  }
  if (dt === "5" || dt === "6") {
    return { object_type: "register", class_id: 3 }
  }
  return { object_type: "data", class_id: 1 }
}
