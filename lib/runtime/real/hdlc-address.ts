/**
 * COSEM HDLC address field encoding (logical → wire), 1-byte form.
 * Wire value = (logical << 1) | 1 for logical < 0x80.
 */

export function encodeHdlcAddress1Byte(logicalAddress: number): number {
  if (logicalAddress < 0 || logicalAddress >= 0x80) {
    throw new Error(`HDLC logical address out of 1-byte range: ${logicalAddress}`)
  }
  return (logicalAddress << 1) | 1
}

export function decodeHdlcAddress1Byte(wireByte: number): number {
  if ((wireByte & 1) !== 1) return -1
  return wireByte >> 1
}
