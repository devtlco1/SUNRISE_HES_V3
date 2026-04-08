import { coerceMeterRow } from "@/lib/meters/coerce"
import {
  csvRecordToMeterFields,
  parseMetersCsvText,
} from "@/lib/meters/meters-csv"
import {
  readMetersJsonRaw,
  writeMetersJsonArray,
} from "@/lib/meters/meters-file"
import { normalizeMeterRow, normalizeMeterRows } from "@/lib/meters/normalize"
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

  const { rows: csvRows, errors: parseErrors } = parseMetersCsvText(text)
  if (csvRows.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "NO_DATA_ROWS",
        parseErrors,
      },
      { status: 400 }
    )
  }

  const raw = await readMetersJsonRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  let working = normalizeMeterRows(raw.parsed)
  if (working.length === 0 && raw.parsed.length > 0) {
    return NextResponse.json({ error: "INVALID_METERS_PAYLOAD" }, { status: 500 })
  }

  const rowErrors: string[] = [...parseErrors]
  let inserted = 0
  let updated = 0

  for (let i = 0; i < csvRows.length; i++) {
    const rec = csvRows[i]!
    const fields = csvRecordToMeterFields(rec)
    const serial = String(fields.serialNumber ?? "").trim()
    if (!serial) {
      rowErrors.push(`Import row ${i + 2}: missing serial.`)
      continue
    }

    const matchIdx = working.findIndex(
      (r) => r.serialNumber.trim().toLowerCase() === serial.toLowerCase()
    )

    if (matchIdx >= 0) {
      const existing = working[matchIdx]!
      const used = new Set(working.map((r) => r.id))
      used.delete(existing.id)
      const coerced = coerceMeterRow(
        { ...fields, id: existing.id },
        { usedIds: used }
      )
      if (!coerced) {
        rowErrors.push(`Import row ${i + 2}: invalid row for ${serial}.`)
        continue
      }
      const normalized = normalizeMeterRow({ ...coerced, id: existing.id })
      if (!normalized) {
        rowErrors.push(`Import row ${i + 2}: normalization failed for ${serial}.`)
        continue
      }
      const clash = working.some(
        (r, j) =>
          j !== matchIdx &&
          r.serialNumber.trim().toLowerCase() ===
            normalized.serialNumber.trim().toLowerCase()
      )
      if (clash) {
        rowErrors.push(`Import row ${i + 2}: serial conflict for ${serial}.`)
        continue
      }
      working[matchIdx] = normalized
      updated++
    } else {
      const used = new Set(working.map((r) => r.id))
      const coerced = coerceMeterRow(fields, { usedIds: used })
      if (!coerced) {
        rowErrors.push(`Import row ${i + 2}: invalid new row ${serial}.`)
        continue
      }
      const normalized = normalizeMeterRow(coerced)
      if (!normalized) {
        rowErrors.push(`Import row ${i + 2}: normalization failed for ${serial}.`)
        continue
      }
      working.push(normalized)
      inserted++
    }
  }

  const w = await writeMetersJsonArray(working)
  if (!w.ok) {
    return NextResponse.json({ error: w.error }, { status: 500 })
  }

  return NextResponse.json(
    {
      ok: true,
      inserted,
      updated,
      total: working.length,
      rowErrors,
    },
    { headers: { "Cache-Control": "no-store" } }
  )
}
