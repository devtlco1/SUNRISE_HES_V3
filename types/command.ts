export type CommandTemplateId =
  | "disconnect_relay"
  | "reconnect_relay"
  | "on_demand_read"
  | "read_profile"
  | "sync_time"
  | "ping_comm"

export type CommandQueueState =
  | "submitted"
  | "queued"
  | "dispatching"
  | "running"
  | "completed"
  | "partial_failure"
  | "failed"
  | "cancelled"

/** Per-meter outcome within a batch command job. */
export type MeterCommandResultState =
  | "pending"
  | "queued"
  | "running"
  | "success"
  | "failed"
  | "timeout"
  | "rejected"

export type CommandMeterResult = {
  meterId: string
  serialNumber: string
  state: MeterCommandResultState
  responseSummary: string
  updatedAt: string
}

export type CommandJobRow = {
  id: string
  templateId: CommandTemplateId
  templateName: string
  commandType: string
  targetCount: number
  submittedBy: string
  submittedAt: string
  queueState: CommandQueueState
  successCount: number
  failedCount: number
  pendingCount: number
  cancelledCount: number
  /** One-line summary for the jobs table. */
  resultSummary: string
  operatorNote?: string
  priority: "low" | "normal" | "high"
  meterResults: CommandMeterResult[]
}

export type CommandTemplateOption = {
  id: CommandTemplateId
  label: string
  commandType: string
}
