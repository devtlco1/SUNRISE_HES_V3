/**
 * COSEM OBIS logical name: six dot-separated decimal groups (0–255 each).
 * Matches Python `app/adapters/obis_logical_name.py` for control-plane validation.
 */

const GROUP_RE = /^(?:[0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/

export function isValidCosemObisLogicalName(obis: string): boolean {
  const s = obis.trim()
  if (!s) return false
  const parts = s.split(".")
  if (parts.length !== 6) return false
  for (const p of parts) {
    if (!GROUP_RE.test(p)) return false
  }
  return true
}

/** Note appended when a row is disabled due to shape (import / normalize). */
export const INVALID_OBIS_SHAPE_NOTE =
  "INVALID_OBIS_SHAPE: expected six dot-separated numeric groups (0–255 each)."
