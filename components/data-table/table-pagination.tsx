import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TablePaginationProps } from "@/types/table"

type Props = TablePaginationProps & {
  className?: string
}

export function TablePagination({
  page,
  pageSize,
  total,
  onPrevious,
  onNext,
  pageSizeOptions,
  onPageSizeChange,
  className,
}: Props) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1)
  const canPrev = page > 1 && total > 0
  const canNext = to < total && total > 0

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
        <p className="text-sm text-muted-foreground">
          Showing{" "}
          <span className="font-medium text-foreground tabular-nums">{from}</span>
          –
          <span className="font-medium text-foreground tabular-nums">{to}</span> of{" "}
          <span className="font-medium text-foreground tabular-nums">{total}</span>
        </p>
        {total > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums sm:border-l sm:border-border sm:pl-4">
            Page{" "}
            <span className="font-medium text-foreground">{page}</span> of{" "}
            <span className="font-medium text-foreground">{pageCount}</span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pageSizeOptions && onPageSizeChange ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="whitespace-nowrap">Rows per page</span>
            <select
              className={cn(
                "h-8 rounded-lg border border-input bg-background px-2 text-sm text-foreground shadow-none outline-none",
                "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              )}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canPrev}
            onClick={onPrevious}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canNext}
            onClick={onNext}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
