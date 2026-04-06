import metersSeed from "@/data/meters.json"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import type { MeterListRow } from "@/types/meter"

/**
 * Dev / Storybook helper — same catalog as `data/meters.json`, normalized.
 * Set `NEXT_PUBLIC_METERS_USE_MOCK=true` on the Meters page to skip HTTP.
 */
export const mockMeterListRows: MeterListRow[] = normalizeMeterRows(metersSeed)
