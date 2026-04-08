import { logConnectivityRuntimeEnvelope } from "@/lib/connectivity-events/runtime-envelope"
import {
  postReadBasicRegistersToPythonSidecar,
  postReadObisSelectionToPythonSidecar,
  postRelayDisconnectToPythonSidecar,
  postRelayReconnectToPythonSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import type { OperatorActionType } from "@/types/command-operator"
import type { ObisSelectionItemInput, RuntimeResponseEnvelope } from "@/types/runtime"

function summarizeEnvelope(
  env: RuntimeResponseEnvelope<unknown>,
  fallback: string
): string {
  if (env.message && env.message.trim()) return env.message.trim()
  return env.ok ? fallback : "Runtime reported failure"
}

export async function executeMeterRuntimeAction(input: {
  meterId: string
  action: OperatorActionType
  readProfileMode?: string
}): Promise<{ ok: boolean; summary: string; errorDetail?: string }> {
  const body = { meterId: input.meterId }

  try {
    if (input.action === "read") {
      if (input.readProfileMode === "obis_catalog_slice_v1") {
        return {
          ok: false,
          summary:
            "Read mode obis_catalog_slice_v1 is not wired in Phase 2 — use default register pull or Readings OBIS UI.",
          errorDetail: "UNSUPPORTED_READ_MODE_FOR_COMMAND_ENGINE",
        }
      }
      const envelope = await postReadBasicRegistersToPythonSidecar(body)
      logConnectivityRuntimeEnvelope(envelope, { route: "direct_tcp" })
      return {
        ok: envelope.ok,
        summary: summarizeEnvelope(envelope, "Read basic registers OK"),
        errorDetail: envelope.ok
          ? undefined
          : envelope.error?.message ?? envelope.message,
      }
    }

    if (input.action === "relay_on") {
      const envelope = await postRelayReconnectToPythonSidecar(body)
      logConnectivityRuntimeEnvelope(envelope, { route: "direct_tcp" })
      return {
        ok: envelope.ok,
        summary: summarizeEnvelope(envelope, "Relay reconnect OK"),
        errorDetail: envelope.ok
          ? undefined
          : envelope.error?.message ?? envelope.message,
      }
    }

    if (input.action === "relay_off") {
      const envelope = await postRelayDisconnectToPythonSidecar(body)
      logConnectivityRuntimeEnvelope(envelope, { route: "direct_tcp" })
      return {
        ok: envelope.ok,
        summary: summarizeEnvelope(envelope, "Relay disconnect OK"),
        errorDetail: envelope.ok
          ? undefined
          : envelope.error?.message ?? envelope.message,
      }
    }

    return { ok: false, summary: "Unknown action", errorDetail: "BAD_ACTION" }
  } catch (e) {
    if (e instanceof PythonSidecarNotConfiguredError) {
      return {
        ok: false,
        summary: "Python sidecar not configured",
        errorDetail: e.message,
      }
    }
    if (e instanceof PythonSidecarHttpError) {
      return {
        ok: false,
        summary: `Sidecar HTTP ${e.status}`,
        errorDetail: e.bodyText.slice(0, 800),
      }
    }
    return {
      ok: false,
      summary: e instanceof Error ? e.message : "Runtime error",
    }
  }
}

export async function executeMeterReadObisSelection(input: {
  meterId: string
  selectedItems: ObisSelectionItemInput[]
}): Promise<{ ok: boolean; summary: string; errorDetail?: string }> {
  if (input.selectedItems.length === 0) {
    return {
      ok: false,
      summary: "No OBIS items resolved for this meter",
      errorDetail: "EMPTY_OBIS_SELECTION",
    }
  }
  try {
    const envelope = await postReadObisSelectionToPythonSidecar({
      meterId: input.meterId,
      selectedItems: input.selectedItems,
    })
    logConnectivityRuntimeEnvelope(envelope, { route: "direct_tcp" })
    const rowCount = envelope.payload?.rows?.length ?? 0
    return {
      ok: envelope.ok,
      summary: envelope.ok
        ? `OBIS read OK (${rowCount} row(s))`
        : envelope.error?.message ?? envelope.message ?? "OBIS read failed",
      errorDetail: envelope.ok
        ? undefined
        : envelope.error?.message ?? envelope.message,
    }
  } catch (e) {
    if (e instanceof PythonSidecarNotConfiguredError) {
      return {
        ok: false,
        summary: "Python sidecar not configured",
        errorDetail: e.message,
      }
    }
    if (e instanceof PythonSidecarHttpError) {
      return {
        ok: false,
        summary: `Sidecar HTTP ${e.status}`,
        errorDetail: e.bodyText.slice(0, 800),
      }
    }
    return {
      ok: false,
      summary: e instanceof Error ? e.message : "Runtime error",
    }
  }
}
