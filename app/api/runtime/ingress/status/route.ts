import { loadMeterIngressConfig } from "@/lib/runtime/ingress/config"
import { loadInboundMeterProtocolProfile } from "@/lib/runtime/ingress/inbound-profile"
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
  const profile = loadInboundMeterProtocolProfile()
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
      protocolProfile: {
        sessionEnabled: profile.sessionEnabled,
        valid: profile.valid,
        configError: profile.configError,
        auth: profile.auth,
        passwordConfigured: profile.password !== null && profile.password.length > 0,
        clientLogical: profile.clientLogical,
        meterAddressHex: profile.meterServerAddress.toString("hex"),
        useBroadcastSnrmFirst: profile.useBroadcastSnrmFirst,
        broadcastSnrmConfigured:
          profile.broadcastSnrm !== null && profile.broadcastSnrm.length > 0,
        identityObis: profile.identityObis,
        identityClassId: profile.identityClassId,
        identityAttributeId: profile.identityAttributeId,
        dlmsReadTimeoutMs: profile.dlmsReadTimeoutMs,
      },
      status,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
