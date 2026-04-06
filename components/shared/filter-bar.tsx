import { cn } from "@/lib/utils"

type FilterBarProps = {
  children?: React.ReactNode
  className?: string
}

/**
 * Visual shell only: future search, filters, and chip rows slot in here.
 * Keep layout and density identical across list pages.
 */
export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex min-h-10 flex-wrap items-center gap-2 rounded-lg border border-dashed border-border bg-muted/25 px-3 py-2.5",
        className
      )}
    >
      {children ?? (
        <span className="text-sm text-muted-foreground">
          Filter and search controls will mount here.
        </span>
      )}
    </div>
  )
}
