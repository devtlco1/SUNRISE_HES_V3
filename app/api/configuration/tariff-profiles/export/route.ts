import { tariffProfilesToCsv } from "@/lib/configuration/tariff-profiles-csv"
import { readTariffProfilesRaw } from "@/lib/configuration/tariff-profiles-file"
import { normalizeTariffProfileRows } from "@/lib/configuration/tariff-profiles-normalize"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const raw = await readTariffProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  const rows = normalizeTariffProfileRows(raw.parsed)
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(tariffProfilesToCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="tariff-profiles-export-${stamp}.csv"`,
    },
  })
}
