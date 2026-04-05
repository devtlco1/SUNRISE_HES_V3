export type TablePaginationProps = {
  page: number
  pageSize: number
  total: number
}

export type MeterConnectivityRow = {
  id: string
  name: string
  channel: string
  lastSeen: string
  linkStatus: "online" | "offline" | "degraded"
}
