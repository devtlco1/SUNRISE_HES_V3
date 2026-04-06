import { LLC_SEND } from "@/lib/runtime/real/dlms-apdu"

/**
 * LN context AARQ with LLS password (calling-authentication-value / AC block).
 * Password is sent as ASCII octets inside context-specific [0] per common COSEM stacks.
 */
export function buildAarqLlsLnPayload(passwordAscii: string): Uint8Array {
  const pwd = Buffer.from(passwordAscii, "utf8")
  const acBlock = Buffer.concat([
    Buffer.from([0xac, pwd.length + 2, 0x80, pwd.length]),
    pwd,
  ])
  const inner = Buffer.concat([
    Buffer.from([
      0xa1, 0x09, 0x06, 0x07, 0x60, 0x85, 0x74, 0x05, 0x08, 0x01, 0x01,
    ]),
    Buffer.from([0x8a, 0x02, 0x07, 0x80]),
    Buffer.from([0x8b, 0x07, 0x60, 0x85, 0x74, 0x05, 0x08, 0x02, 0x01]),
    acBlock,
  ])
  const aarq = Buffer.concat([Buffer.from([0x60, inner.length]), inner])
  const out = new Uint8Array(LLC_SEND.length + aarq.length)
  out.set(LLC_SEND, 0)
  out.set(aarq, LLC_SEND.length)
  return out
}
