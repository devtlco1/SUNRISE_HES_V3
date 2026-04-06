import { encodeHdlcAddress1Byte } from "@/lib/runtime/real/hdlc-address"
import type { OutboundAarqInitiateSnapshot } from "@/lib/runtime/real/dlms-aarq-diag"
import {
  GURUX_INITIAL_LN_PROPOSED_CONFORMANCE,
  type AarqInitiateWireOptions,
} from "@/lib/runtime/real/dlms-aarq-lls"

export type InboundDlmsAuthMode = "LOW" | "NONE"

/** Env-driven xDLMS InitiateRequest fields inside AARQ user-information (LOW path). */
export type InboundAarqInitiateProfile = {
  profileLabel: "gurux_default" | "conservative" | "custom_env"
  maxPduSize: number
  proposedConformance24: number
}

function defaultAarqInitiateProfile(): InboundAarqInitiateProfile {
  return {
    profileLabel: "gurux_default",
    maxPduSize: 0xffff,
    proposedConformance24: GURUX_INITIAL_LN_PROPOSED_CONFORMANCE,
  }
}

function loadInboundAarqInitiateProfile(): InboundAarqInitiateProfile {
  const conservative =
    process.env.RUNTIME_INGRESS_DLMS_AARQ_PROFILE?.trim().toLowerCase() === "conservative"
  let profileLabel: InboundAarqInitiateProfile["profileLabel"] = "gurux_default"
  let maxPdu = 0xffff
  let conf = GURUX_INITIAL_LN_PROPOSED_CONFORMANCE

  if (conservative) {
    profileLabel = "conservative"
    maxPdu = 1024
    conf = 0x80_000
  }

  const confHex = process.env.RUNTIME_INGRESS_DLMS_AARQ_CONFORMANCE_HEX?.trim()
  if (confHex && /^[0-9a-fA-F]{6}$/.test(confHex)) {
    profileLabel = "custom_env"
    conf = Number.parseInt(confHex, 16) & 0xffffff
  }

  const maxPduRaw = process.env.RUNTIME_INGRESS_DLMS_AARQ_MAX_PDU?.trim()
  if (maxPduRaw && maxPduRaw.length > 0) {
    const n = Number.parseInt(maxPduRaw, 10)
    if (Number.isFinite(n)) {
      profileLabel = "custom_env"
      maxPdu = Math.max(64, Math.min(n, 0xffff))
    }
  }

  return { profileLabel, maxPduSize: maxPdu, proposedConformance24: conf }
}

/** Map profile → `buildAarqLlsLnPayload` / initiate builder options. */
export function inboundAarqInitiateWireOptions(p: InboundAarqInitiateProfile): AarqInitiateWireOptions {
  return {
    maxPduSize: p.maxPduSize,
    proposedConformance24: p.proposedConformance24,
  }
}

export function inboundAarqInitiateSnapshot(p: InboundAarqInitiateProfile): OutboundAarqInitiateSnapshot {
  return {
    profileLabel: p.profileLabel,
    maxPduSize: p.maxPduSize,
    proposedConformance24: p.proposedConformance24,
  }
}

/**
 * Non-secret baseline for MVP-AMI–style meters. Override any field via env on the VPS.
 * Passwords and tokens must come from env only (`RUNTIME_INGRESS_DLMS_PASSWORD`).
 */
const VENDOR_BASELINE = {
  clientLogical: 1,
  serverLogicalBase: 1,
  useMeterSerialForServerAddress: true,
  meterSerialNumber: "2046303",
  serverAddressHex: "0002046303",
  useBroadcastSnrmFirst: true,
  broadcastSnrmHex: "7EA00AFEFEFEFF0393C9837E",
  iecAckHexCandidates: ["063235320D0A", "06B235B28D0A"] as string[],
  afterIecSleepMs: 1200,
  dlmsReadTimeoutMs: 2500,
  dlmsReadIdleMs: 120,
  uaSwapAddresses: false,
  sendDiscBeforeClose: true,
  discDrainTimeoutMs: 400,
  identityObis: "0.0.96.1.1.255",
  identityClassId: 1,
  identityAttributeId: 2,
} as const

function truthyEnv(v: string | undefined): boolean {
  if (v === undefined) return false
  const t = v.trim().toLowerCase()
  return t === "1" || t === "true" || t === "yes"
}

function falsyEnv(v: string | undefined): boolean {
  if (v === undefined) return false
  const t = v.trim().toLowerCase()
  return t === "0" || t === "false" || t === "no"
}

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (raw === undefined || raw === "") return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : fallback
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (raw === undefined || raw === "") return fallback
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

export type InboundMeterProtocolProfile = {
  valid: boolean
  configError: string | null
  /** Run DLMS state machine on accepted sockets when ingress is enabled. */
  sessionEnabled: boolean
  auth: InboundDlmsAuthMode
  /** From env only; never defaulted to a real production secret in code. */
  password: string | null
  clientLogical: number
  meterServerAddress: Buffer
  clientAddressWire: Buffer
  useBroadcastSnrmFirst: boolean
  broadcastSnrm: Buffer | null
  iecAckHexCandidates: Buffer[]
  afterIecSleepMs: number
  dlmsReadTimeoutMs: number
  dlmsReadIdleMs: number
  uaSwapAddresses: boolean
  sendDiscBeforeClose: boolean
  discDrainTimeoutMs: number
  identityObis: string
  identityClassId: number
  identityAttributeId: number
  aarqInitiate: InboundAarqInitiateProfile
}

function parseHexOrNull(hex: string | undefined): Buffer | null {
  if (hex === undefined || hex.trim() === "") return null
  const clean = hex.replace(/\s+/g, "")
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) return null
  return Buffer.from(clean, "hex")
}

function commaSeparatedHexList(raw: string | undefined, fallback: string[]): Buffer[] {
  const s = raw?.trim()
  const parts = (s && s.length > 0 ? s.split(/[,;]+/) : fallback).map((x) => x.trim()).filter(Boolean)
  const out: Buffer[] = []
  for (const p of parts) {
    const b = parseHexOrNull(p)
    if (b && b.length > 0) out.push(b)
  }
  return out
}

/**
 * Load inbound vendor/protocol profile. Safe defaults mirror the documented MVP-AMI baseline;
 * override on the server via env. Secrets must be supplied via `RUNTIME_INGRESS_DLMS_PASSWORD` when auth is LOW.
 */
export function loadInboundMeterProtocolProfile(): InboundMeterProtocolProfile {
  const ingressOn = truthyEnv(process.env.RUNTIME_TCP_METER_INGRESS_ENABLED)
  const sessionExplicitOff = falsyEnv(process.env.RUNTIME_INGRESS_DLMS_SESSION_ENABLED)
  const sessionEnabled = ingressOn && !sessionExplicitOff

  const authRaw = (process.env.RUNTIME_INGRESS_DLMS_AUTH ?? "LOW").trim().toUpperCase()
  const auth: InboundDlmsAuthMode = authRaw === "NONE" ? "NONE" : "LOW"

  /**
   * Optional AARQ xDLMS InitiateRequest shaping (LOW path only on the wire):
   * - `RUNTIME_INGRESS_DLMS_AARQ_PROFILE=conservative` → max PDU 1024, conformance GET-only (`0x80000`).
   * - `RUNTIME_INGRESS_DLMS_AARQ_MAX_PDU` / `RUNTIME_INGRESS_DLMS_AARQ_CONFORMANCE_HEX` (6 hex digits) override.
   * See `lastOutboundAssociationHdlcDiagnostic` + `lastOutboundAarqDiagnostic` on the ingress trace.
   *
   * LLS secret for ingress DLMS only. Source of truth is this env var at process start — not any
   * UI form or DB profile from other HES surfaces. Confirm on-wire bytes via
   * `status.inboundProtocolTrace.lastOutboundAarqDiagnostic` on a controlled host.
   */
  const passwordRaw = process.env.RUNTIME_INGRESS_DLMS_PASSWORD?.trim()
  const password = passwordRaw && passwordRaw.length > 0 ? passwordRaw : null

  if (sessionEnabled && auth === "LOW" && !password) {
    return {
      valid: false,
      configError:
        "RUNTIME_INGRESS_DLMS_AUTH=LOW requires RUNTIME_INGRESS_DLMS_PASSWORD to be set on the server (not committed).",
      sessionEnabled,
      auth,
      password: null,
      clientLogical: VENDOR_BASELINE.clientLogical,
      meterServerAddress: Buffer.alloc(0),
      clientAddressWire: Buffer.alloc(0),
      useBroadcastSnrmFirst: VENDOR_BASELINE.useBroadcastSnrmFirst,
      broadcastSnrm: null,
      iecAckHexCandidates: [],
      afterIecSleepMs: VENDOR_BASELINE.afterIecSleepMs,
      dlmsReadTimeoutMs: VENDOR_BASELINE.dlmsReadTimeoutMs,
      dlmsReadIdleMs: VENDOR_BASELINE.dlmsReadIdleMs,
      uaSwapAddresses: VENDOR_BASELINE.uaSwapAddresses,
      sendDiscBeforeClose: VENDOR_BASELINE.sendDiscBeforeClose,
      discDrainTimeoutMs: VENDOR_BASELINE.discDrainTimeoutMs,
      identityObis: VENDOR_BASELINE.identityObis,
      identityClassId: VENDOR_BASELINE.identityClassId,
      identityAttributeId: VENDOR_BASELINE.identityAttributeId,
      aarqInitiate: defaultAarqInitiateProfile(),
    }
  }

  const clientLogical = parseIntEnv(
    "RUNTIME_INGRESS_DLMS_CLIENT_LOGICAL",
    VENDOR_BASELINE.clientLogical
  )
  if (clientLogical < 0 || clientLogical >= 0x80) {
    return {
      valid: false,
      configError: "RUNTIME_INGRESS_DLMS_CLIENT_LOGICAL must be 0–127.",
      sessionEnabled,
      auth,
      password,
      clientLogical,
      meterServerAddress: Buffer.alloc(0),
      clientAddressWire: Buffer.alloc(0),
      useBroadcastSnrmFirst: false,
      broadcastSnrm: null,
      iecAckHexCandidates: [],
      afterIecSleepMs: 0,
      dlmsReadTimeoutMs: 0,
      dlmsReadIdleMs: 0,
      uaSwapAddresses: false,
      sendDiscBeforeClose: false,
      discDrainTimeoutMs: 0,
      identityObis: "",
      identityClassId: 0,
      identityAttributeId: 0,
      aarqInitiate: defaultAarqInitiateProfile(),
    }
  }

  const hexFromEnv = process.env.RUNTIME_INGRESS_DLMS_METER_ADDRESS_HEX?.trim()
  const hexDefault = VENDOR_BASELINE.serverAddressHex
  const meterHex = hexFromEnv && hexFromEnv.length > 0 ? hexFromEnv : hexDefault
  const meterServerAddress = parseHexOrNull(meterHex)
  if (!meterServerAddress || meterServerAddress.length < 1) {
    return {
      valid: false,
      configError:
        "RUNTIME_INGRESS_DLMS_METER_ADDRESS_HEX must be an even-length hex string (or fix defaults).",
      sessionEnabled,
      auth,
      password,
      clientLogical,
      meterServerAddress: Buffer.alloc(0),
      clientAddressWire: Buffer.alloc(0),
      useBroadcastSnrmFirst: false,
      broadcastSnrm: null,
      iecAckHexCandidates: [],
      afterIecSleepMs: 0,
      dlmsReadTimeoutMs: 0,
      dlmsReadIdleMs: 0,
      uaSwapAddresses: false,
      sendDiscBeforeClose: false,
      discDrainTimeoutMs: 0,
      identityObis: "",
      identityClassId: 0,
      identityAttributeId: 0,
      aarqInitiate: defaultAarqInitiateProfile(),
    }
  }

  const clientAddressWire = Buffer.from([encodeHdlcAddress1Byte(clientLogical)])

  const useBroadcast =
    truthyEnv(process.env.RUNTIME_INGRESS_VENDOR_USE_BROADCAST_SNRM_FIRST) ||
    (!falsyEnv(process.env.RUNTIME_INGRESS_VENDOR_USE_BROADCAST_SNRM_FIRST) &&
      VENDOR_BASELINE.useBroadcastSnrmFirst)

  const bHex =
    process.env.RUNTIME_INGRESS_VENDOR_BROADCAST_SNRM_HEX?.trim() ?? VENDOR_BASELINE.broadcastSnrmHex
  const broadcastSnrm = useBroadcast ? parseHexOrNull(bHex) : null

  const iecList = commaSeparatedHexList(
    process.env.RUNTIME_INGRESS_VENDOR_IEC_ACK_HEX_LIST,
    [...VENDOR_BASELINE.iecAckHexCandidates]
  )

  const afterIecSleepMs = parseIntEnv(
    "RUNTIME_INGRESS_VENDOR_AFTER_IEC_SLEEP_MS",
    VENDOR_BASELINE.afterIecSleepMs
  )

  const dlmsReadTimeoutMs = Math.round(
    1000 *
      parseFloatEnv(
        "RUNTIME_INGRESS_DLMS_READ_TIMEOUT_SECONDS",
        VENDOR_BASELINE.dlmsReadTimeoutMs / 1000
      )
  )
  const dlmsReadIdleMs = parseIntEnv(
    "RUNTIME_INGRESS_DLMS_READ_IDLE_MS",
    VENDOR_BASELINE.dlmsReadIdleMs
  )

  const uaSwapAddresses = truthyEnv(process.env.RUNTIME_INGRESS_VENDOR_UA_SWAP_ADDRESSES)
    ? true
    : falsyEnv(process.env.RUNTIME_INGRESS_VENDOR_UA_SWAP_ADDRESSES)
      ? false
      : VENDOR_BASELINE.uaSwapAddresses

  const sendDisc =
    !falsyEnv(process.env.RUNTIME_INGRESS_VENDOR_SEND_DISC_BEFORE_CLOSE) &&
    (truthyEnv(process.env.RUNTIME_INGRESS_VENDOR_SEND_DISC_BEFORE_CLOSE) ||
      VENDOR_BASELINE.sendDiscBeforeClose)

  const discDrainTimeoutMs = Math.round(
    1000 *
      parseFloatEnv(
        "RUNTIME_INGRESS_VENDOR_DISC_DRAIN_TIMEOUT_SECONDS",
        VENDOR_BASELINE.discDrainTimeoutMs / 1000
      )
  )

  const identityObis =
    process.env.RUNTIME_INGRESS_IDENTITY_OBIS?.trim() ?? VENDOR_BASELINE.identityObis
  const identityClassId = parseIntEnv(
    "RUNTIME_INGRESS_IDENTITY_CLASS_ID",
    VENDOR_BASELINE.identityClassId
  )
  const identityAttributeId = parseIntEnv(
    "RUNTIME_INGRESS_IDENTITY_ATTRIBUTE_ID",
    VENDOR_BASELINE.identityAttributeId
  )

  const aarqInitiate = loadInboundAarqInitiateProfile()

  return {
    valid: true,
    configError: null,
    sessionEnabled,
    auth,
    password,
    clientLogical,
    meterServerAddress,
    clientAddressWire,
    useBroadcastSnrmFirst: useBroadcast,
    broadcastSnrm,
    iecAckHexCandidates: iecList,
    afterIecSleepMs,
    dlmsReadTimeoutMs: Math.max(300, dlmsReadTimeoutMs),
    dlmsReadIdleMs: Math.max(50, dlmsReadIdleMs),
    uaSwapAddresses,
    sendDiscBeforeClose: sendDisc,
    discDrainTimeoutMs: Math.max(50, discDrainTimeoutMs),
    identityObis,
    identityClassId,
    identityAttributeId,
    aarqInitiate,
  }
}
