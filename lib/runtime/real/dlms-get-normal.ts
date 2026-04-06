import { LLC_SEND } from "@/lib/runtime/real/dlms-apdu"

/**
 * xDLMS GET-Request-Normal for class 1, 6-byte OBIS, attribute id, access selector 0.
 * Invoke-Id-And-Priority fixed to 0x41 for predictable response matching.
 */
export function buildGetRequestNormalPayload(
  classId: number,
  obis6: Uint8Array,
  attributeId: number
): Uint8Array {
  if (obis6.length !== 6) {
    throw new Error("OBIS instance id must be 6 bytes")
  }
  const pdu = Buffer.concat([
    Buffer.from([0xc0, 0x01, 0x41]),
    Buffer.from([(classId >> 8) & 0xff, classId & 0xff]),
    Buffer.from(obis6),
    Buffer.from([attributeId, 0x00]),
  ])
  const out = new Uint8Array(LLC_SEND.length + pdu.length)
  out.set(LLC_SEND, 0)
  out.set(pdu, LLC_SEND.length)
  return out
}

/** Parse 0.A.B.C.D.E OBIS string into 6 wire bytes (COSEM compact form). */
export function obisStringToSixBytes(obis: string): Uint8Array | null {
  const parts = obis.trim().split(".").map((p) => Number.parseInt(p, 10))
  if (parts.length !== 6 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return null
  }
  return new Uint8Array(parts)
}

export type ParsedGetResponse = {
  verified: boolean
  /** Raw value bytes if decoded (octet/visible string body or primitive). */
  valueHex: string | null
  note: string
}

/**
 * Best-effort GET-Response-Normal parse after LLC header strip.
 * Verified only when C4/01 pattern, data CHOICE (0x01), and a length-prefixed value.
 */
export function parseGetResponseNormal(apdu: Uint8Array): ParsedGetResponse {
  let i = 0
  while (i < apdu.length - 2) {
    if (apdu[i] === 0xc4 && apdu[i + 1] === 0x01) break
    i++
  }
  if (i >= apdu.length - 2) {
    return { verified: false, valueHex: null, note: "get_response_tag_not_found" }
  }
  i += 2
  if (i >= apdu.length) {
    return { verified: false, valueHex: null, note: "get_response_truncated" }
  }
  if (apdu[i] === 0xc1) {
    i += 3
  } else {
    i += 1
  }
  if (i >= apdu.length) {
    return { verified: false, valueHex: null, note: "invoke_truncated" }
  }
  const dataChoice = apdu[i]
  if (dataChoice === 0x00) {
    return { verified: false, valueHex: null, note: "data_access_result_error" }
  }
  if (dataChoice !== 0x01) {
    return { verified: false, valueHex: null, note: `data_choice_${dataChoice}` }
  }
  i++
  if (i + 2 > apdu.length) {
    return { verified: false, valueHex: null, note: "data_body_truncated" }
  }
  const valTag = apdu[i]
  const valLen = apdu[i + 1]
  if (i + 2 + valLen > apdu.length) {
    return { verified: false, valueHex: null, note: "data_value_truncated" }
  }
  const raw = apdu.subarray(i + 2, i + 2 + valLen)
  return {
    verified: true,
    valueHex: Buffer.from(raw).toString("hex"),
    note: `get_response_tag_${valTag.toString(16)}`,
  }
}
