"use client"

import { MetersList } from "@/components/meters/meters-list"
import { PageHeader } from "@/components/shared/page-header"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { mockMeterListRows } from "@/lib/mock/meters"
import { cn } from "@/lib/utils"
import { ChevronDownIcon, DownloadIcon, PlusIcon, UploadIcon } from "lucide-react"
import Link from "next/link"
import { useCallback, useRef, useState } from "react"

type MetersPageClientProps = {
  useMockMeters: boolean
}

export function MetersPageClient({ useMockMeters }: MetersPageClientProps) {
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const actionsRef = useRef<{
    openAdd: () => void
    refresh: () => void
  } | null>(null)

  const staticMode = useMockMeters

  const onImportFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file || staticMode) return
      setImporting(true)
      setImportMsg(null)
      try {
        const body = new FormData()
        body.set("file", file)
        const r = await fetch("/api/meters/import-csv", {
          method: "POST",
          body,
        })
        const data = (await r.json()) as {
          ok?: boolean
          error?: string
          inserted?: number
          updated?: number
          rowErrors?: string[]
        }
        if (!r.ok || !data.ok) {
          setImportMsg(data.error ?? "Import failed")
          return
        }
        const re = data.rowErrors?.length
          ? ` Notes: ${data.rowErrors.slice(0, 5).join("; ")}`
          : ""
        setImportMsg(
          `Imported: ${data.inserted ?? 0} new, ${data.updated ?? 0} updated.${re}`
        )
        actionsRef.current?.refresh()
      } catch {
        setImportMsg("Import failed")
      } finally {
        setImporting(false)
      }
    },
    [staticMode]
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meters"
        subtitle={
          useMockMeters
            ? "Mock catalog (NEXT_PUBLIC_METERS_USE_MOCK)."
            : "Registry from data/meters.json. Primary key: serial number."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(ev) => void onImportFile(ev)}
            />
            <Link
              href="/scanner"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "h-8"
              )}
            >
              Scanner
            </Link>
            {staticMode ? (
              <span
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "inline-flex h-8 cursor-not-allowed items-center opacity-50"
                )}
              >
                <DownloadIcon className="mr-1 size-3.5" />
                Export
              </span>
            ) : (
              <a
                href="/api/meters/export"
                download
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-8"
                )}
              >
                <DownloadIcon className="mr-1 size-3.5" />
                Export
              </a>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  buttonVariants({ variant: "secondary", size: "sm" }),
                  "h-8 gap-1"
                )}
                disabled={importing || staticMode}
              >
                <UploadIcon className="size-3.5" />
                Import
                <ChevronDownIcon className="size-3.5 opacity-70" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => importInputRef.current?.click()}
                >
                  Upload file
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async () => {
                    try {
                      const r = await fetch("/api/meters/template")
                      const blob = await r.blob()
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement("a")
                      a.href = url
                      a.download = "meters-template.csv"
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      URL.revokeObjectURL(url)
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  Download template
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              type="button"
              size="sm"
              className="h-8"
              disabled={staticMode}
              onClick={() => actionsRef.current?.openAdd()}
            >
              <PlusIcon className="mr-1 size-3.5" />
              Add meter
            </Button>
          </div>
        }
      />

      {importMsg ? (
        <p
          className={
            importMsg.includes("failed") || importMsg.includes("Failed")
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {importMsg}
        </p>
      ) : null}

      <MetersList
        rows={useMockMeters ? mockMeterListRows : undefined}
        onRegisterActions={(api) => {
          actionsRef.current = api
        }}
      />
    </div>
  )
}
