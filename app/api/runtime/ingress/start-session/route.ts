import { loadMeterIngressConfig, getInternalApiToken } from "@/lib/runtime/ingress/config"
import { loadInboundMeterProtocolProfile } from "@/lib/runtime/ingress/inbound-profile"
import { runStagedTriggeredInboundSession } from "@/lib/runtime/ingress/inbound-dlms-session"
import { getIngressProcessRuntime } from "@/lib/runtime/ingress/runtime-global"
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"

export const dynamic = "force-dynamic"

function authorize(req: NextRequest): boolean {
  const tok = getInternalApiToken()
  if (!tok) return false
  const h = req.headers.get("authorization")
  return h === `Bearer ${tok}`
}

/**
 * POST — run MVP-AMI TCP POC–style IEC/ACK/delay/DLMS on the currently stashed inbound socket.
 * Requires `INTERNAL_API_TOKEN` and `Authorization: Bearer <token>`.
 */
export async function POST(req: NextRequest) {
  if (!getInternalApiToken()) {
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_API_TOKEN must be set to call this route",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    )
  }
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  const ingressCfg = loadMeterIngressConfig()
  if (ingressCfg.sessionMode !== "staged_triggered_session") {
    return NextResponse.json(
      {
        ok: false,
        error: "wrong_ingress_session_mode",
        detail: ingressCfg.sessionMode,
        hint: "Set RUNTIME_TCP_METER_INGRESS_SESSION_MODE=staged_triggered_session",
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    )
  }

  const rt = getIngressProcessRuntime()
  const st = rt.staged
  if (st.triggerInProgress) {
    return NextResponse.json({ ok: false, error: "busy" }, { status: 409 })
  }

  const sock = st.socket
  if (!sock || sock.destroyed) {
    return NextResponse.json({ ok: false, error: "no_staged_socket" }, { status: 409 })
  }

  const profile = loadInboundMeterProtocolProfile()
  if (!profile.valid || !profile.sessionEnabled) {
    return NextResponse.json(
      {
        ok: false,
        error: "inbound_profile_invalid",
        detail: profile.configError,
      },
      { status: 400 }
    )
  }

  st.triggerInProgress = true
  st.startSessionInvokeTotal += 1
  st.lastInvokedAtIso = new Date().toISOString()

  try {
    await runStagedTriggeredInboundSession(sock, profile)
    const d = getIngressProcessRuntime().diagnostics
    st.lastFinishedAtIso = new Date().toISOString()
    st.lastError = d.lastIngressError
    if (d.inboundIdentityReadVerifiedOnWire) {
      st.lastResult = "ok_identity"
    } else if (d.inboundAssociationVerifiedOnWire) {
      st.lastResult = "ok_association_no_identity"
    } else if (d.inboundAssociationAttempted) {
      st.lastResult = "association_not_verified"
    } else {
      st.lastResult = "ended_before_association"
    }
    return NextResponse.json(
      {
        ok: true,
        result: st.lastResult,
        lastIngressError: d.lastIngressError,
        inboundAssociationVerifiedOnWire: d.inboundAssociationVerifiedOnWire,
        inboundIdentityReadVerifiedOnWire: d.inboundIdentityReadVerifiedOnWire,
        lastInboundProtocolPhase: d.lastInboundProtocolPhase,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    st.lastFinishedAtIso = new Date().toISOString()
    st.lastResult = "error"
    st.lastError = msg
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    st.triggerInProgress = false
  }
}
