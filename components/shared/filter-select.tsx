"use client"

import { cn } from "@/lib/utils"

export type FilterSelectOption = { value: string; label: string }

type FilterSelectProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: FilterSelectOption[]
  className?: string
}

const selectClass = cn(
  "h-8 w-full min-w-[9rem] rounded-lg border border-input bg-background px-2 text-sm text-foreground shadow-none outline-none",
  "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
  "disabled:cursor-not-allowed disabled:opacity-50"
)

/** Native select styled for filter rows; swap internals later without changing page layout. */
export function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  className,
}: FilterSelectProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label
        htmlFor={id}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
