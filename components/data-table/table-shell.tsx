import { cn } from "@/lib/utils"

type TableShellProps = {
  children: React.ReactNode
  className?: string
}

/**
 * Shared table chrome: rounded border, neutral background, single scroll surface.
 * Compose with TableToolbar, shadcn Table, TablePagination, and/or TableEmpty.
 */
export function TableShell({ children, className }: TableShellProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-none",
        className
      )}
    >
      {children}
    </div>
  )
}
