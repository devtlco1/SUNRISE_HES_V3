/**
 * RUNTIME_ADAPTER env parsing and display metadata (server-only).
 * Keeps factory and status API aligned.
 */

export type RuntimeAdapterConfigured = "stub" | "real" | "unknown"

export type ParsedRuntimeAdapterEnv =
  | { kind: "stub" }
  | { kind: "real" }
  | { kind: "unknown"; raw: string }

export function parseRuntimeAdapterEnv(
  value: string | undefined
): ParsedRuntimeAdapterEnv {
  const trimmed = (value ?? "").trim()
  if (trimmed === "") return { kind: "stub" }
  const v = trimmed.toLowerCase()
  if (v === "stub") return { kind: "stub" }
  if (v === "real" || v === "dlms") return { kind: "real" }
  return { kind: "unknown", raw: trimmed }
}

/** Serializable status for GET /api/runtime/status and the dev harness. */
export type RuntimeAdapterPublicStatus = {
  configuredMode: RuntimeAdapterConfigured
  /** Adapter class actually used after fallback rules. */
  effectiveAdapter: "stub" | "real"
  /** True when responses are stub/simulator-backed (including unknown→stub fallback). */
  simulatedResponses: boolean
  envValue: string
  summary: string
  warning: string | null
}

export function getRuntimeAdapterPublicStatus(): RuntimeAdapterPublicStatus {
  const rawEnv = process.env.RUNTIME_ADAPTER
  const envDisplay =
    rawEnv === undefined || rawEnv.trim() === "" ? "(unset)" : rawEnv.trim()
  const parsed = parseRuntimeAdapterEnv(rawEnv)

  if (parsed.kind === "stub") {
    return {
      configuredMode: "stub",
      effectiveAdapter: "stub",
      simulatedResponses: true,
      envValue: envDisplay,
      summary:
        "Stub/simulator adapter: successful operations return simulated: true (see data/runtime-simulator.json).",
      warning: null,
    }
  }

  if (parsed.kind === "real") {
    const probeConfigured =
      (process.env.RUNTIME_PROBE_HOST?.trim() ?? "") !== "" &&
      (process.env.RUNTIME_PROBE_PORT?.trim() ?? "") !== ""
    const probeLine = probeConfigured
      ? "RUNTIME_PROBE_* is set: probe may perform TCP reachability only (diagnostics.outcome may be transport_reachable_unverified; never verifiedOnWire)."
      : "RUNTIME_PROBE_HOST/PORT unset: probe returns not_attempted (PROBE_TARGET_NOT_CONFIGURED). Association/reads/relay remain not_implemented."
    return {
      configuredMode: "real",
      effectiveAdapter: "real",
      simulatedResponses: false,
      envValue: envDisplay,
      summary: `Real adapter (staged): ${probeLine} No DLMS/COSEM execution in this repo revision.`,
      warning:
        "Not verified smart-meter communication. Use diagnostics on each response; restart with RUNTIME_ADAPTER=stub for full simulator success paths.",
    }
  }

  return {
    configuredMode: "unknown",
    effectiveAdapter: "stub",
    simulatedResponses: true,
    envValue: parsed.raw,
    summary: "Unknown RUNTIME_ADAPTER value; fell back to stub adapter.",
    warning: `Unrecognized RUNTIME_ADAPTER="${parsed.raw}" — using stub. Valid: stub, real, dlms (alias of real skeleton).`,
  }
}
