export type DashboardStat = {
  label: string
  value: string
  description?: string
}

export type ActivityItem = {
  id: string
  occurredAt: string
  summary: string
  tone: "neutral" | "success" | "warning"
}

export type LatestCommandRow = {
  id: string
  command: string
  meterSerial: string
  status: "success" | "pending" | "failed" | "neutral"
  submittedAt: string
}
