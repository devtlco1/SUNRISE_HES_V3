/**
 * Targeted structured logs for operator command runs (server-side only).
 */
export function logCommandExecutionFailure(payload: {
  runId?: string
  meterId: string
  meterSerial: string
  action: string
  transport: "inbound_tcp" | "direct_tcp" | "blocked"
  sidecarPath?: string
  httpStatus?: number
  message: string
}): void {
  console.warn("[command-execution]", JSON.stringify(payload))
}
