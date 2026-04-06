export type MeterCommStatus = "online" | "offline" | "degraded" | "dormant"

export type MeterRelayStatus = "energized" | "open" | "unknown" | "test"

export type MeterAlarmState = "none" | "warning" | "critical"

export type MeterPhaseType = "single" | "three_wye" | "three_delta"

/** Full row shape for the operational meters registry (mock / future API). */
export type MeterListRow = {
  id: string
  serialNumber: string
  customerName: string
  feeder: string
  transformer: string
  zone: string
  manufacturer: string
  model: string
  commStatus: MeterCommStatus
  relayStatus: MeterRelayStatus
  lastReadingAt: string
  lastCommunicationAt: string
  alarmState: MeterAlarmState
  phaseType: MeterPhaseType
  firmwareVersion: string
}
