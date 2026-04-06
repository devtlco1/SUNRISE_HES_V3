import { cn } from "@/lib/utils"

export function DetailBlock({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="rounded-lg border border-border bg-muted/15 px-3 py-3 text-sm">
        {children}
      </div>
    </div>
  )
}

export function DlGrid({
  items,
}: {
  items: { label: string; value: React.ReactNode }[]
}) {
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0 space-y-0.5">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
