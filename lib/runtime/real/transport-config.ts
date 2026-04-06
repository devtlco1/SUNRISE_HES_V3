/**
 * Optional TCP probe target for real-adapter reachability checks.
 * Does not imply a meter; only a host:port the operator opts into (lab/gateway).
 */

export type TcpProbeConfig =
  | {
      ok: true
      host: string
      port: number
      timeoutMs: number
    }
  | { ok: false; code: string; message: string }

function parsePort(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null
  const n = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(n) || n < 1 || n > 65535) return null
  return n
}

function parseTimeoutMs(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return 5000
  const n = Number.parseInt(raw.trim(), 10)
  if (!Number.isFinite(n) || n < 100 || n > 120_000) return 5000
  return n
}

/**
 * Requires both RUNTIME_PROBE_HOST and RUNTIME_PROBE_PORT.
 * Optional RUNTIME_PROBE_TIMEOUT_MS (100–120000, default 5000).
 */
export function loadTcpProbeConfig(): TcpProbeConfig {
  const host = process.env.RUNTIME_PROBE_HOST?.trim() ?? ""
  const portRaw = process.env.RUNTIME_PROBE_PORT
  const port = parsePort(portRaw)

  if (host === "" && (portRaw === undefined || portRaw.trim() === "")) {
    return {
      ok: false,
      code: "PROBE_TARGET_NOT_CONFIGURED",
      message:
        "Set RUNTIME_PROBE_HOST and RUNTIME_PROBE_PORT to run an optional TCP reachability probe. This does not verify DLMS or a meter.",
    }
  }

  if (host === "" || port === null) {
    return {
      ok: false,
      code: "PROBE_CONFIG_INVALID",
      message:
        "RUNTIME_PROBE_HOST and RUNTIME_PROBE_PORT must both be set to valid values (port 1–65535).",
    }
  }

  return {
    ok: true,
    host,
    port,
    timeoutMs: parseTimeoutMs(process.env.RUNTIME_PROBE_TIMEOUT_MS),
  }
}
