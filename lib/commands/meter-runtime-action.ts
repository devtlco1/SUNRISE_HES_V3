import { logConnectivityRuntimeEnvelope } from "@/lib/connectivity-events/runtime-envelope"
import { logCommandExecutionFailure } from "@/lib/commands/command-execution-log"
import { resolveCommandMeterTransport } from "@/lib/commands/command-meter-transport"
import { summarizeCommandSidecarHttpError } from "@/lib/commands/sidecar-command-error"
import {
  postReadBasicRegistersToPythonSidecar,
  postReadObisSelectionToPythonSidecar,
  postRelayDisconnectToPythonSidecar,
  postRelayReconnectToPythonSidecar,
  postTcpListenerReadBasicRegistersToPythonSidecar,
  postTcpListenerReadObisSelectionToPythonSidecar,
  postTcpListenerRelayDisconnectToPythonSidecar,
  postTcpListenerRelayReconnectToPythonSidecar,
  PythonSidecarHttpError,
  PythonSidecarNotConfiguredError,
} from "@/lib/runtime/python-sidecar/client"
import type { OperatorActionType } from "@/types/command-operator"
import type { ObisSelectionItemInput, RuntimeResponseEnvelope } from "@/types/runtime"

type CommandLogCtx = {
  runId?: string
  actionGroupMode?: string | null
}

function summarizeEnvelope(
  env: RuntimeResponseEnvelope<unknown>,
  fallback: string
): string {
  if (env.message && env.message.trim()) return env.message.trim()
  return env.ok ? fallback : "Runtime reported failure"
}

function logHttpFailure(
  e: PythonSidecarHttpError,
  input: {
    runId?: string
    meterId: string
    meterSerial: string
    action: string
    transport: "inbound_tcp" | "direct_tcp"
    actionLabel: string
  }
): { summary: string; errorDetail: string } {
  const { summary, detail } = summarizeCommandSidecarHttpError(e, {
    actionLabel: input.actionLabel,
    transport: input.transport,
  })
  logCommandExecutionFailure({
    runId: input.runId,
    meterId: input.meterId,
    meterSerial: input.meterSerial,
    action: input.action,
    transport: input.transport,
    sidecarPath: e.requestUrl,
    httpStatus: e.status,
    message: `${summary} — ${detail.slice(0, 400)}`,
  })
  return { summary, errorDetail: detail }
}

export async function executeMeterRuntimeAction(input: {
  meterId: string
  /** Registry serial; used to match inbound listener sessions. */
  meterSerial: string
  action: OperatorActionType
  readProfileMode?: string
  commandLog?: CommandLogCtx
}): Promise<{ ok: boolean; summary: string; errorDetail?: string }> {
  /** Python runtime matches inbound sessions and MVP-AMI config by canonical serial, not registry row id. */
  const runtimeMeterKey = input.meterSerial.trim() || input.meterId
  const body = { meterId: runtimeMeterKey }
  const logCtx = input.commandLog

  try {
    const transport = await resolveCommandMeterTransport(input.meterSerial)

    if (transport.kind === "blocked") {
      logCommandExecutionFailure({
        runId: logCtx?.runId,
        meterId: input.meterId,
        meterSerial: input.meterSerial,
        action: input.action,
        transport: "blocked",
        message: transport.message,
      })
      return {
        ok: false,
        summary: "Inbound session not ready",
        errorDetail: transport.message,
      }
    }

    const useListener = transport.kind === "tcp_listener"
    const routeLabel = useListener ? "inbound_tcp" : "direct_tcp"
    const tcpTransport: "inbound_tcp" | "direct_tcp" = useListener
      ? "inbound_tcp"
      : "direct_tcp"

    if (input.action === "read") {
      if (input.readProfileMode === "obis_catalog_slice_v1") {
        return {
          ok: false,
          summary:
            "Read mode obis_catalog_slice_v1 is not wired in Phase 2 — use default register pull or Readings OBIS UI.",
          errorDetail: "UNSUPPORTED_READ_MODE_FOR_COMMAND_ENGINE",
        }
      }
      try {
        const envelope = useListener
          ? await postTcpListenerReadBasicRegistersToPythonSidecar(body)
          : await postReadBasicRegistersToPythonSidecar(body)
        logConnectivityRuntimeEnvelope(envelope, { route: routeLabel })
        return {
          ok: envelope.ok,
          summary: summarizeEnvelope(envelope, "Read basic registers OK"),
          errorDetail: envelope.ok
            ? undefined
            : envelope.error?.message ?? envelope.message,
        }
      } catch (e) {
        if (e instanceof PythonSidecarHttpError) {
          const r = logHttpFailure(e, {
            runId: logCtx?.runId,
            meterId: input.meterId,
            meterSerial: input.meterSerial,
            action: "read_basic_registers",
            transport: tcpTransport,
            actionLabel: "Read basic registers",
          })
          return { ok: false, summary: r.summary, errorDetail: r.errorDetail }
        }
        throw e
      }
    }

    if (input.action === "relay_on") {
      try {
        const envelope = useListener
          ? await postTcpListenerRelayReconnectToPythonSidecar(body)
          : await postRelayReconnectToPythonSidecar(body)
        logConnectivityRuntimeEnvelope(envelope, { route: routeLabel })
        return {
          ok: envelope.ok,
          summary: summarizeEnvelope(envelope, "Relay reconnect OK"),
          errorDetail: envelope.ok
            ? undefined
            : envelope.error?.message ?? envelope.message,
        }
      } catch (e) {
        if (e instanceof PythonSidecarHttpError) {
          const r = logHttpFailure(e, {
            runId: logCtx?.runId,
            meterId: input.meterId,
            meterSerial: input.meterSerial,
            action: "relay_on",
            transport: tcpTransport,
            actionLabel: "Relay reconnect (on)",
          })
          return { ok: false, summary: r.summary, errorDetail: r.errorDetail }
        }
        throw e
      }
    }

    if (input.action === "relay_off") {
      try {
        const envelope = useListener
          ? await postTcpListenerRelayDisconnectToPythonSidecar(body)
          : await postRelayDisconnectToPythonSidecar(body)
        logConnectivityRuntimeEnvelope(envelope, { route: routeLabel })
        return {
          ok: envelope.ok,
          summary: summarizeEnvelope(envelope, "Relay disconnect OK"),
          errorDetail: envelope.ok
            ? undefined
            : envelope.error?.message ?? envelope.message,
        }
      } catch (e) {
        if (e instanceof PythonSidecarHttpError) {
          const r = logHttpFailure(e, {
            runId: logCtx?.runId,
            meterId: input.meterId,
            meterSerial: input.meterSerial,
            action: "relay_off",
            transport: tcpTransport,
            actionLabel: "Relay disconnect (off)",
          })
          return { ok: false, summary: r.summary, errorDetail: r.errorDetail }
        }
        throw e
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
      const r = logHttpFailure(e, {
        runId: logCtx?.runId,
        meterId: input.meterId,
        meterSerial: input.meterSerial,
        action: input.action,
        transport: "direct_tcp",
        actionLabel: `Action ${input.action}`,
      })
      return { ok: false, summary: r.summary, errorDetail: r.errorDetail }
    }
    return {
      ok: false,
      summary: e instanceof Error ? e.message : "Runtime error",
    }
  }
}

export async function executeMeterReadObisSelection(input: {
  meterId: string
  meterSerial: string
  selectedItems: ObisSelectionItemInput[]
  commandLog?: CommandLogCtx
}): Promise<{ ok: boolean; summary: string; errorDetail?: string }> {
  if (input.selectedItems.length === 0) {
    return {
      ok: false,
      summary: "No OBIS items resolved for this meter",
      errorDetail: "EMPTY_OBIS_SELECTION",
    }
  }

  const logCtx = input.commandLog
  const runtimeMeterKey = input.meterSerial.trim() || input.meterId
  const payload = {
    meterId: runtimeMeterKey,
    selectedItems: input.selectedItems,
  }

  try {
    const transport = await resolveCommandMeterTransport(input.meterSerial)

    if (transport.kind === "blocked") {
      logCommandExecutionFailure({
        runId: logCtx?.runId,
        meterId: input.meterId,
        meterSerial: input.meterSerial,
        action: "read_obis_selection",
        transport: "blocked",
        message: transport.message,
      })
      return {
        ok: false,
        summary: "Inbound session not ready",
        errorDetail: transport.message,
      }
    }

    const useListener = transport.kind === "tcp_listener"
    const routeLabel = useListener ? "inbound_tcp" : "direct_tcp"
    const tcpTransport: "inbound_tcp" | "direct_tcp" = useListener
      ? "inbound_tcp"
      : "direct_tcp"

    try {
      const envelope = useListener
        ? await postTcpListenerReadObisSelectionToPythonSidecar(payload)
        : await postReadObisSelectionToPythonSidecar(payload)
      logConnectivityRuntimeEnvelope(envelope, { route: routeLabel })
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
      if (e instanceof PythonSidecarHttpError) {
        const r = logHttpFailure(e, {
          runId: logCtx?.runId,
          meterId: input.meterId,
          meterSerial: input.meterSerial,
          action: "read_obis_selection",
          transport: tcpTransport,
          actionLabel: "Read OBIS selection (catalog)",
        })
        return { ok: false, summary: r.summary, errorDetail: r.errorDetail }
      }
      throw e
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
      const r = logHttpFailure(e, {
        runId: logCtx?.runId,
        meterId: input.meterId,
        meterSerial: input.meterSerial,
        action: "read_obis_selection",
        transport: "direct_tcp",
        actionLabel: "Read OBIS selection (catalog)",
      })
      return { ok: false, summary: r.summary, errorDetail: r.errorDetail }
    }
    return {
      ok: false,
      summary: e instanceof Error ? e.message : "Runtime error",
    }
  }
}
