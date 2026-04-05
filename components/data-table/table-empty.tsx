import { InboxIcon } from "lucide-react"

import { EmptyState } from "@/components/shared/empty-state"
import { cn } from "@/lib/utils"

type TableEmptyProps = {
  title?: string
  description?: string
  className?: string
}

export function TableEmpty({
  title = "No rows to display",
  description = "When data is available, it will appear in this table using the shared layout.",
  className,
}: TableEmptyProps) {
  return (
    <div className={cn("border-t border-border bg-card px-4 py-10", className)}>
      <EmptyState
        title={title}
        description={description}
        icon={<InboxIcon className="size-5" aria-hidden />}
      />
    </div>
  )
}
