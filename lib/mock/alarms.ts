import alarmsSeed from "@/data/alarms.json"
import { normalizeAlarmRows } from "@/lib/alarms/normalize"
import type { AlarmListRow } from "@/types/alarm"

/**
 * Dev / offline UI — same catalog as `data/alarms.json`, normalized.
 * Set `NEXT_PUBLIC_ALARMS_USE_MOCK=true` on the Alarms page to skip HTTP.
 */
export const mockAlarmListRows: AlarmListRow[] = normalizeAlarmRows(alarmsSeed)
