import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TablePaginationProps } from "@/types/table"

type Props = TablePaginationProps & {
  className?: string
}

export function TablePagination({ page, pageSize, total, className }: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const canPrev = page > 1 && total > 0
  const canNext = to < total

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border-t border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">
        Showing{" "}
        <span className="font-medium text-foreground tabular-nums">{from}</span>
        –
        <span className="font-medium text-foreground tabular-nums">{to}</span> of{" "}
        <span className="font-medium text-foreground tabular-nums">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!canPrev}>
          Previous
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!canNext}>
          Next
        </Button>
      </div>
    </div>
  )
}
