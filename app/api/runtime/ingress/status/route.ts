import { loadMeterIngressConfig } from "@/lib/runtime/ingress/config"
import { getMeterIngressPublicStatus } from "@/lib/runtime/ingress/state"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export const dynamic = "force-dynamic"

/**
 * Inbound meter TCP ingress diagnostics (no secrets). Does not imply verified DLMS.
 */
export async function GET() {
  const cfg = loadMeterIngressConfig()
  const status = getMeterIngressPublicStatus(cfg.enabled)
  return NextResponse.json(
    {
      config: {
        enabled: cfg.enabled,
        valid: cfg.valid,
        host: cfg.host,
        port: cfg.port,
        socketTimeoutSeconds: cfg.socketTimeoutSeconds,
        configError: cfg.configError,
      },
      status,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
