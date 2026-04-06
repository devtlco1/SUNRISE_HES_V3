/**
 * Whether the internal runtime test harness UI may be served.
 * Production remains locked unless explicitly enabled.
 */
export function isDevRuntimeHarnessAllowed(): boolean {
  if (process.env.NODE_ENV === "development") return true
  const flag = process.env.ALLOW_DEV_RUNTIME_HARNESS?.trim().toLowerCase()
  return flag === "1" || flag === "true" || flag === "yes"
}
