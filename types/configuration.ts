import type {
  MeterCommStatus,
  MeterPhaseType,
  MeterRelayStatus,
} from "@/types/meter"

/** Default property set for a class of meter (Configuration → Meter Profiles). */
export type MeterProfileRow = {
  id: string
  name: string
  manufacturer: string
  model: string
  firmware: string
  phaseType: MeterPhaseType
  defaultRelayStatus: MeterRelayStatus
  /** When set, new meters from this profile inherit this comm default. */
  defaultCommStatus: MeterCommStatus
  /** Empty string = none */
  defaultTariffProfileId: string
  notes: string
  active: boolean
}

export type TariffProfileRow = {
  id: string
  name: string
  code: string
  description: string
  active: boolean
  notes: string
}

export type FeederRow = {
  id: string
  code: string
  name: string
  notes: string
}

export type TransformerRow = {
  id: string
  code: string
  name: string
  feederId: string
  notes: string
}

export type ZoneRow = {
  id: string
  code: string
  name: string
  feederId: string
  notes: string
}

export type GridTopologyDoc = {
  feeders: FeederRow[]
  transformers: TransformerRow[]
  zones: ZoneRow[]
}
