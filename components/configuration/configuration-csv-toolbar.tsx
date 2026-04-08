"use client"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DownloadIcon, FileDownIcon, UploadIcon } from "lucide-react"
import { useCallback, useRef, useState } from "react"

type ConfigurationCsvToolbarProps = {
  exportHref: string
  templateHref: string
  importHref: string
  onImportDone?: (message: string | null) => void
  disabled?: boolean
}

export function ConfigurationCsvToolbar({
  exportHref,
  templateHref,
  importHref,
  disabled = false,
  onImportDone,
}: ConfigurationCsvToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file || disabled) return
      setBusy(true)
      onImportDone?.(null)
      try {
        const body = new FormData()
        body.set("file", file)
        const r = await fetch(importHref, { method: "POST", body })
        const data = (await r.json()) as {
          ok?: boolean
          error?: string
          inserted?: number
          updated?: number
          rowErrors?: string[]
        }
        if (!r.ok || !data.ok) {
          onImportDone?.(data.error ?? "Import failed")
          return
        }
        const note = data.rowErrors?.length
          ? ` ${data.rowErrors.slice(0, 4).join("; ")}`
          : ""
        onImportDone?.(
          `Imported ${data.inserted ?? 0} new, ${data.updated ?? 0} updated.${note}`
        )
      } catch {
        onImportDone?.("Import failed")
      } finally {
        setBusy(false)
      }
    },
    [disabled, importHref, onImportDone]
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(ev) => void onFile(ev)}
      />
      <a
        href={exportHref}
        download
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-8",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <DownloadIcon className="mr-1 size-3.5" />
        Export
      </a>
      <a
        href={templateHref}
        download
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "h-8",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <FileDownIcon className="mr-1 size-3.5" />
        Template
      </a>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        <UploadIcon className="mr-1 size-3.5" />
        {busy ? "Importing…" : "Import"}
      </Button>
    </div>
  )
}
