export type TablePaginationProps = {
  page: number
  pageSize: number
  total: number
  /** When set, Previous is clickable whenever `page > 1`. */
  onPrevious?: () => void
  /** When set, Next is clickable whenever another page exists. */
  onNext?: () => void
  /** Optional rows-per-page control (list pages). */
  pageSizeOptions?: number[]
  onPageSizeChange?: (pageSize: number) => void
}

export type MeterConnectivityRow = {
  id: string
  name: string
  channel: string
  lastSeen: string
  linkStatus: "online" | "offline" | "degraded"
}
