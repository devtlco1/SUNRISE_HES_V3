import { cn } from "@/lib/utils"

type SectionCardProps = {
  title?: string
  description?: string
  children: React.ReactNode
  className?: string
  /** Extra header actions aligned with the title row */
  headerActions?: React.ReactNode
}

export function SectionCard({
  title,
  description,
  headerActions,
  children,
  className,
}: SectionCardProps) {
  const showHeader = title || description || headerActions

  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground shadow-none",
        className
      )}
    >
      {showHeader ? (
        <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            ) : null}
            {description ? (
              <p className="text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {headerActions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {headerActions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}
