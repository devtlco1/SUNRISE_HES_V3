"use client"

import { ChevronsUpDownIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { MeterListRow } from "@/types/meter"
import { cn } from "@/lib/utils"

type MeterSearchComboboxProps = {
  meters: MeterListRow[]
  value: string
  onChange: (serial: string) => void
  disabled?: boolean
}

export function MeterSearchCombobox({
  meters,
  value,
  onChange,
  disabled,
}: MeterSearchComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!open) return
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return meters
    return meters.filter((m) => m.serialNumber.toLowerCase().includes(q))
  }, [meters, query])

  const exactFromQuery = query.trim()
  const allowCustom =
    exactFromQuery.length > 0 &&
    !meters.some((m) => m.serialNumber === exactFromQuery)

  return (
    <div ref={rootRef} className="relative w-full max-w-lg min-w-[12rem]">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        className="h-9 w-full justify-between font-mono text-sm font-normal"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (!disabled) setOpen((o) => !o)
        }}
      >
        <span className="truncate text-left">
          {value.trim() ? value.trim() : "Search or select meter…"}
        </span>
        <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
      </Button>
      {open ? (
        <div
          className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          role="listbox"
        >
          <div className="border-b border-border p-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by serial…"
              className="h-8 text-sm"
              autoFocus
            />
          </div>
          <ul className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted-foreground">
                No matching meters in list.
              </li>
            ) : (
              filtered.map((m) => (
                <li key={m.id} role="option" aria-selected={m.serialNumber === value}>
                  <button
                    type="button"
                    className={cn(
                      "w-full px-3 py-2 text-left font-mono text-sm hover:bg-muted",
                      m.serialNumber === value.trim() && "bg-muted"
                    )}
                    onClick={() => {
                      onChange(m.serialNumber)
                      setOpen(false)
                      setQuery("")
                    }}
                  >
                    {m.serialNumber}
                  </button>
                </li>
              ))
            )}
          </ul>
          {allowCustom ? (
            <div className="border-t border-border p-2">
              <button
                type="button"
                className="w-full rounded-md border border-dashed border-border px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                onClick={() => {
                  onChange(exactFromQuery)
                  setOpen(false)
                  setQuery("")
                }}
              >
                Use serial{" "}
                <span className="font-mono text-foreground">{exactFromQuery}</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
