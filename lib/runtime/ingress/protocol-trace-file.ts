import fs from "node:fs"
import path from "node:path"

import { getIngressProcessRuntime } from "@/lib/runtime/ingress/runtime-global"

const MAX_FILE_BYTES = 110_000

/**
 * Writes the last `inboundProtocolTrace` JSON to a path from env (single file, overwrite).
 * Set `RUNTIME_INGRESS_LAST_SESSION_TRACE_PATH` on the VPS (e.g. `/var/log/sunrise-ingress-last.json`).
 */
export function flushIngressTraceToFile(reason: string): void {
  const p = process.env.RUNTIME_INGRESS_LAST_SESSION_TRACE_PATH?.trim()
  if (!p) return
  try {
    const snap = getIngressProcessRuntime().diagnostics.inboundProtocolTrace
    const obj = {
      writtenAt: new Date().toISOString(),
      reason,
      trace: snap,
    }
    let body = JSON.stringify(obj)
    if (Buffer.byteLength(body, "utf8") > MAX_FILE_BYTES) {
      body = JSON.stringify({
        writtenAt: obj.writtenAt,
        reason,
        error: "trace_json_exceeded_max_file_bytes",
        maxFileBytes: MAX_FILE_BYTES,
        note: "Fetch /api/runtime/ingress/status for bounded trace or raise cap in code.",
      })
    }
    const dir = path.dirname(p)
    fs.mkdirSync(dir, { recursive: true })
    const tmp = `${p}.tmp`
    fs.writeFileSync(tmp, body, { encoding: "utf8", mode: 0o600 })
    fs.renameSync(tmp, p)
  } catch (e) {
    console.warn("[meter-ingress] trace file write failed", e)
  }
}
