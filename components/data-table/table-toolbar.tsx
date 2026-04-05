import { cn } from "@/lib/utils"

type TableToolbarProps = {
  left?: React.ReactNode
  right?: React.ReactNode
  className?: string
}

export function TableToolbar({ left, right, className }: TableToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-b border-border bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {right}
      </div>
    </div>
  )
}
