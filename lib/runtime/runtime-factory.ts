import type { SmartMeterRuntimeAdapter } from "@/lib/runtime/runtime-adapter"
import { StubRuntimeAdapter } from "@/lib/runtime/stub-runtime-adapter"

export type RuntimeAdapterKind = "stub"

/**
 * Resolves the process-wide runtime adapter.
 * Default: stub. Set `RUNTIME_ADAPTER=stub` explicitly if desired.
 * Future: add `dlms` or similar when a real adapter ships (factory returns it here).
 */
export function getRuntimeAdapter(): SmartMeterRuntimeAdapter {
  const kind = (process.env.RUNTIME_ADAPTER ?? "stub").toLowerCase() as string
  if (kind === "stub" || kind === "") {
    return new StubRuntimeAdapter()
  }
  if (kind === "real" || kind === "dlms") {
    throw new Error(
      "RUNTIME_ADAPTER is set to a non-stub value but no real protocol adapter is registered in this build."
    )
  }
  console.warn(`[runtime] Unknown RUNTIME_ADAPTER="${kind}", falling back to stub.`)
  return new StubRuntimeAdapter()
}

export function getRuntimeAdapterKind(): RuntimeAdapterKind {
  const kind = (process.env.RUNTIME_ADAPTER ?? "stub").toLowerCase()
  if (kind === "stub" || kind === "") return "stub"
  return "stub"
}
