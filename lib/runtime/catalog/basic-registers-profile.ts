/**
 * OBIS list for the `read-basic-registers` profile on the catalog-guarded Next path.
 * Must stay aligned with Python `Settings.basic_registers_obis` defaults
 * (`apps/runtime-python/app/config.py`).
 */
const DEFAULT_BASIC_REGISTERS_OBIS =
  "0.0.1.0.0.255,1.0.1.8.0.255,1.0.32.7.0.255"

/**
 * Server-only: comma-separated OBIS from env (same variable name as Python sidecar).
 */
export function getRequiredObisForBasicRegistersProfile(): string[] {
  const raw =
    process.env.SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS?.trim() ||
    DEFAULT_BASIC_REGISTERS_OBIS
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}
