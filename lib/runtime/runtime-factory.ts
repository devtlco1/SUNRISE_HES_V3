import { parseRuntimeAdapterEnv } from "@/lib/runtime/adapter-mode"
import type { SmartMeterRuntimeAdapter } from "@/lib/runtime/runtime-adapter"
import { RealRuntimeAdapter } from "@/lib/runtime/real-runtime-adapter"
import { StubRuntimeAdapter } from "@/lib/runtime/stub-runtime-adapter"

export type RuntimeAdapterKind = "stub" | "real"

/**
 * Resolves the process-wide runtime adapter.
 *
 * - `RUNTIME_ADAPTER` unset or `stub` → {@link StubRuntimeAdapter} (default).
 * - `real` or `dlms` → {@link RealRuntimeAdapter} (skeleton; not live transport).
 * - Any other value → stub + console warning.
 */
export function getRuntimeAdapter(): SmartMeterRuntimeAdapter {
  const parsed = parseRuntimeAdapterEnv(process.env.RUNTIME_ADAPTER)
  if (parsed.kind === "stub") {
    return new StubRuntimeAdapter()
  }
  if (parsed.kind === "real") {
    return new RealRuntimeAdapter()
  }
  console.warn(
    `[runtime] Unknown RUNTIME_ADAPTER="${parsed.raw}", falling back to stub.`
  )
  return new StubRuntimeAdapter()
}

/** Effective adapter kind after env resolution (unknown → stub). */
export function getRuntimeAdapterKind(): RuntimeAdapterKind {
  const parsed = parseRuntimeAdapterEnv(process.env.RUNTIME_ADAPTER)
  if (parsed.kind === "real") return "real"
  return "stub"
}
