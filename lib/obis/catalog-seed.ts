/**
 * Small OBIS string constants for sidecar defaults (not the operator catalog model).
 */

/** Default OBIS set for sidecar `read-basic-registers` (see docs / SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS). */
export const SIDECAR_DEFAULT_BASIC_REGISTERS_OBIS: readonly string[] = [
  "0.0.1.0.0.255",
  "1.0.1.8.0.255",
  "1.0.32.7.0.255",
]

/** OBIS rows populated from a single `read-identity` call (IdentityPayload field mapping). */
export const IDENTITY_READ_MAPPED_OBIS: readonly string[] = [
  "0.0.96.1.0.255",
  "0.0.96.1.1.255",
]
