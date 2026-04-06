import { parseRuntimeTargetBody } from "@/lib/runtime/contracts"
import { getRuntimeAdapter } from "@/lib/runtime/runtime-factory"
import type { SmartMeterRuntimeAdapter } from "@/lib/runtime/runtime-adapter"
import type { RuntimeResponseEnvelope, RuntimeTargetRequest } from "@/types/runtime"
import { NextResponse } from "next/server"

type RuntimePostHandler = (
  adapter: SmartMeterRuntimeAdapter,
  body: RuntimeTargetRequest
) => Promise<RuntimeResponseEnvelope>

/**
 * Shared POST handler: JSON body → validate → factory adapter → JSON envelope.
 */
export async function handleRuntimePost(
  req: Request,
  run: RuntimePostHandler
): Promise<Response> {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }
  const parsed = parseRuntimeTargetBody(json)
  if (!parsed) {
    return NextResponse.json(
      {
        error: "INVALID_BODY",
        message:
          "Expected JSON object with meterId (1–128 chars: letters, digits, dot, underscore, hyphen). Optional: endpointId, channelHint (strings ≤256).",
      },
      { status: 400 }
    )
  }
  try {
    const adapter = getRuntimeAdapter()
    const result = await run(adapter, parsed)
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "RUNTIME_INTERNAL_ERROR"
    return NextResponse.json(
      { error: "RUNTIME_INTERNAL_ERROR", message: msg },
      { status: 500 }
    )
  }
}
