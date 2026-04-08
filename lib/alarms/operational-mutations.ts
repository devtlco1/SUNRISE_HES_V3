import {
  readOperationalAlarmsRaw,
  writeOperationalAlarmsArray,
} from "@/lib/alarms/operational-store"

export async function markOperationalAlarmCleared(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await readOperationalAlarmsRaw()
  const idx = rows.findIndex((r) => r.id === id)
  if (idx < 0) return { ok: false, error: "NOT_FOUND" }
  const now = new Date().toISOString()
  const next = [...rows]
  const row = next[idx]!
  next[idx] = {
    ...row,
    status: "cleared",
    clearedAt: now,
    updatedAt: now,
  }
  const w = await writeOperationalAlarmsArray(next)
  if (!w.ok) return { ok: false, error: w.error }
  return { ok: true }
}
