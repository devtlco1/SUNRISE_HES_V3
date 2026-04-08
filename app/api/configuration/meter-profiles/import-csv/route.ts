import { allocateConfigId } from "@/lib/configuration/config-id"
import {
  readMeterProfilesRaw,
  writeMeterProfilesArray,
} from "@/lib/configuration/meter-profiles-file"
import {
  normalizeMeterProfileRow,
  normalizeMeterProfileRows,
} from "@/lib/configuration/meter-profiles-normalize"
import { parseCsvKeyed, rowToMeterProfileFields } from "@/lib/configuration/parse-csv"
import type { MeterProfileRow } from "@/types/configuration"
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

  const raw = await readMeterProfilesRaw()
  if (!raw.ok) {
    return NextResponse.json({ error: raw.error }, { status: 500 })
  }
  let working = normalizeMeterProfileRows(raw.parsed)
  const rowErrors: string[] = [...parseErrors]
  let inserted = 0
  let updated = 0

  for (let i = 0; i < keyed.length; i++) {
    const fields = rowToMeterProfileFields(keyed[i]!)
    const name = String(fields.name ?? "").trim()
    if (!name) {
      rowErrors.push(`Row ${i + 2}: missing name.`)
      continue
    }
    const used = new Set(working.map((r) => r.id))
    const idIn = String(fields.id ?? "").trim()
    const idx = idIn ? working.findIndex((r) => r.id === idIn) : -1

    const activeStr = String(fields.active ?? "true").toLowerCase()
    const active = activeStr !== "false" && activeStr !== "0"

    if (idx >= 0) {
      const merged = { ...working[idx]!, ...fields, id: idIn, name, active } as Record<
        string,
        unknown
      >
      const norm = normalizeMeterProfileRow(merged)
      if (!norm) {
        rowErrors.push(`Row ${i + 2}: invalid update for ${idIn}.`)
        continue
      }
      working[idx] = norm
      updated++
      continue
    }

    let newId = idIn
    if (!newId) {
      newId = allocateConfigId("mp", name, used)
    } else if (used.has(newId)) {
      rowErrors.push(`Row ${i + 2}: id ${newId} already used.`)
      continue
    } else {
      used.add(newId)
    }

    const candidate: MeterProfileRow = {
      id: newId,
      name,
      manufacturer: String(fields.manufacturer ?? "—").trim() || "—",
      model: String(fields.model ?? "—").trim() || "—",
      firmware: String(fields.firmware ?? "—").trim() || "—",
      phaseType:
        fields.phaseType === "single" ||
        fields.phaseType === "three_wye" ||
        fields.phaseType === "three_delta"
          ? fields.phaseType
          : "single",
      defaultRelayStatus:
        fields.defaultRelayStatus === "energized" ||
        fields.defaultRelayStatus === "open" ||
        fields.defaultRelayStatus === "unknown" ||
        fields.defaultRelayStatus === "test"
          ? fields.defaultRelayStatus
          : "unknown",
      defaultCommStatus:
        fields.defaultCommStatus === "online" ||
        fields.defaultCommStatus === "offline" ||
        fields.defaultCommStatus === "degraded" ||
        fields.defaultCommStatus === "dormant"
          ? fields.defaultCommStatus
          : "offline",
      defaultTariffProfileId: String(fields.defaultTariffProfileId ?? "").trim(),
      notes: String(fields.notes ?? "").trim(),
      active,
    }
    const norm = normalizeMeterProfileRow(candidate)
    if (!norm) {
      rowErrors.push(`Row ${i + 2}: could not create ${name}.`)
      continue
    }
    working.push(norm)
    inserted++
  }

  const w = await writeMeterProfilesArray(working)
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
