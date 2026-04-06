import { cn } from "@/lib/utils"

type OperationalActionStripProps = {
  /** Short uppercase label (e.g. Triage, Directory). */
  label: string
  children: React.ReactNode
  className?: string
}

/**
 * Compact bulk-action bar above filters — same chrome on Alarms, Users, and similar pages.
 */
export function OperationalActionStrip({
  label,
  children,
  className,
}: OperationalActionStripProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-muted/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}
