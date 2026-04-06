import { cn } from "@/lib/utils"

type TableBodySkeletonProps = {
  rows?: number
  columns?: number
  className?: string
}

export function TableBodySkeleton({
  rows = 6,
  columns = 10,
  className,
}: TableBodySkeletonProps) {
  return (
    <tbody className={cn("[&_tr]:border-b", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, ri) => (
        <tr key={ri} className="border-b border-border">
          {Array.from({ length: columns }).map((_, ci) => (
            <td key={ci} className="p-2 align-middle">
              <div
                className="h-4 max-w-full animate-pulse rounded-md bg-muted"
                style={{ width: ci === 0 ? "70%" : ci === columns - 1 ? "40%" : "85%" }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}
