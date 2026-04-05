import { cn } from "@/lib/utils"

type StatCardProps = {
  label: string
  value: string
  description?: string
  className?: string
}

export function StatCard({
  label,
  value,
  description,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-4 py-4 shadow-none",
        className
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {description ? (
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
