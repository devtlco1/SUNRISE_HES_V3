"use client"

import { useMemo, useState } from "react"

import { PageHeader } from "@/components/shared/page-header"
import { SectionCard } from "@/components/shared/section-card"
import { Button } from "@/components/ui/button"
import {
  OBIS_CATALOG_SEED,
  OBIS_PACK_LABELS,
  OBIS_PACK_ORDER,
} from "@/lib/obis/catalog-seed"
import type { ObisPackKey } from "@/lib/obis/types"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function ObisConfigCatalogClient() {
  const [packFilter, setPackFilter] = useState<ObisPackKey | "all">("all")

  const rows = useMemo(() => {
    if (packFilter === "all") return OBIS_CATALOG_SEED
    return OBIS_CATALOG_SEED.filter((r) => r.pack_key === packFilter)
  }, [packFilter])

  return (
    <div className="space-y-6">
      <PageHeader
        title="OBIS catalog"
        subtitle="Operator-facing OBIS metadata and packs. Canonical seed lives in lib/obis/catalog-seed.ts — deploy changes via repo update."
      />

      <SectionCard title="Pack filter" description="Meter parameter groups.">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPackFilter("all")}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium",
              packFilter === "all"
                ? "border-primary bg-primary/10"
                : "border-border bg-background hover:bg-muted/40"
            )}
          >
            All packs
          </button>
          {OBIS_PACK_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPackFilter(key)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs font-medium",
                packFilter === key
                  ? "border-primary bg-primary/10"
                  : "border-border bg-background hover:bg-muted/40"
              )}
            >
              {OBIS_PACK_LABELS[key]}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Catalog"
        description={`${rows.length} row(s) shown.`}
        headerActions={
          <Button type="button" size="sm" variant="outline" disabled title="Planned">
            Export CSV
          </Button>
        }
      >
        <div className="max-h-[70vh] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="whitespace-nowrap">OBIS</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="whitespace-nowrap">Object type</TableHead>
                <TableHead className="text-right">Class</TableHead>
                <TableHead className="text-right">Attr</TableHead>
                <TableHead className="text-right">Sc/U</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="whitespace-nowrap">Format</TableHead>
                <TableHead className="whitespace-nowrap">Pack</TableHead>
                <TableHead className="whitespace-nowrap">Status</TableHead>
                <TableHead className="text-center">En.</TableHead>
                <TableHead className="text-right">Sort</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.obis}>
                  <TableCell className="font-mono text-xs">{r.obis}</TableCell>
                  <TableCell className="max-w-[200px] text-xs">
                    {r.description}
                  </TableCell>
                  <TableCell className="text-xs">{r.object_type}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.class_id}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.attribute}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.scaler_unit_attribute}
                  </TableCell>
                  <TableCell className="text-xs">{r.unit || "—"}</TableCell>
                  <TableCell className="text-xs">{r.result_format}</TableCell>
                  <TableCell className="text-xs">
                    {OBIS_PACK_LABELS[r.pack_key]}
                  </TableCell>
                  <TableCell className="text-xs">{r.status}</TableCell>
                  <TableCell className="text-center text-xs">
                    {r.enabled ? "Y" : "N"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {r.sort_order}
                  </TableCell>
                  <TableCell className="max-w-[180px] text-xs text-muted-foreground">
                    {r.notes ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </div>
  )
}
