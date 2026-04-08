import { allocateConfigId } from "@/lib/configuration/config-id"
import {
  readTariffProfilesRaw,
  writeTariffProfilesArray,
} from "@/lib/configuration/tariff-profiles-file"
import {
  normalizeTariffProfileRow,
  normalizeTariffProfileRows,
} from "@/lib/configuration/tariff-profiles-normalize"
import { parseCsvKeyed, rowToTariffProfileFields } from "@/lib/configuration/parse-csv"
import type { TariffProfileRow } from "@/types/configuration"
import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "INVALID_FORM" }, { status: 400 })
  }
  const file = form.get("file")
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "FILE_REQUIRED" }, { status: 400 })
  }
  const text = await (file as File).text()
  const { rows: keyed, errors: parseErrors } = parseCsvKeyed(text)
  if (keyed.length === 0) {
    return NextResponse.json(
      { ok: false, error: "NO_DATA_ROWS", parseErrors },
      { status: 400 }
    )
  }

  const raw = await readTariffProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  let working = normalizeTariffProfileRows(raw.parsed)
  const rowErrors: string[] = [...parseErrors]
  let inserted = 0
  let updated = 0

  for (let i = 0; i < keyed.length; i++) {
    const fields = rowToTariffProfileFields(keyed[i]!)
    const name = String(fields.name ?? "").trim()
    const code = String(fields.code ?? "").trim()
    if (!name || !code) {
      rowErrors.push(`Row ${i + 2}: name and code required.`)
      continue
    }
    const used = new Set(working.map((r) => r.id))
    const idIn = String(fields.id ?? "").trim()
    const idx = idIn ? working.findIndex((r) => r.id === idIn) : -1

    const activeStr = String(fields.active ?? "true").toLowerCase()
    const active = activeStr !== "false" && activeStr !== "0"

    if (idx >= 0) {
      const merged = {
        ...working[idx]!,
        ...fields,
        id: idIn,
        name,
        code,
        active,
      } as Record<string, unknown>
      const norm = normalizeTariffProfileRow(merged)
      if (!norm) {
        rowErrors.push(`Row ${i + 2}: invalid update.`)
        continue
      }
      working[idx] = norm
      updated++
      continue
    }

    let newId = idIn
    if (!newId) {
      newId = allocateConfigId("tf", code, used)
    } else if (used.has(newId)) {
      rowErrors.push(`Row ${i + 2}: id clash.`)
      continue
    } else {
      used.add(newId)
    }

    const candidate: TariffProfileRow = {
      id: newId,
      name,
      code,
      description: String(fields.description ?? "").trim(),
      active,
      notes: String(fields.notes ?? "").trim(),
    }
    const norm = normalizeTariffProfileRow(candidate)
    if (!norm) {
      rowErrors.push(`Row ${i + 2}: create failed.`)
      continue
    }
    working.push(norm)
    inserted++
  }

  const w = await writeTariffProfilesArray(working)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    inserted,
    updated,
    rowErrors: rowErrors.length ? rowErrors : undefined,
  })
}
