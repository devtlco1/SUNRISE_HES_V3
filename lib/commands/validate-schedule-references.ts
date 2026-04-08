import {
  readCommandGroupsRaw,
  readObisCodeGroupsRaw,
} from "@/lib/commands/operator-file"
import {
  normalizeCommandGroups,
  normalizeObisCodeGroups,
} from "@/lib/commands/operator-normalize"

export async function validateScheduleGroupRefs(input: {
  meterGroupId: string | null
  obisCodeGroupId: string | null
}): Promise<
  | { ok: true }
  | { ok: false; status: number; error: string }
> {
  if (!input.meterGroupId || !input.obisCodeGroupId) {
    return { ok: true }
  }
  const graw = await readCommandGroupsRaw()
  if (!graw.ok) {
    return { ok: false, status: 500, error: graw.error }
  }
  const groups = normalizeCommandGroups(graw.parsed)
  if (!groups.some((g) => g.id === input.meterGroupId)) {
    return { ok: false, status: 400, error: "UNKNOWN_METER_GROUP_ID" }
  }

  const oraw = await readObisCodeGroupsRaw()
  if (!oraw.ok) {
    return { ok: false, status: 500, error: oraw.error }
  }
  const obisGroups = normalizeObisCodeGroups(oraw.parsed)
  if (!obisGroups.some((g) => g.id === input.obisCodeGroupId)) {
    return { ok: false, status: 400, error: "UNKNOWN_OBIS_CODE_GROUP_ID" }
  }

  return { ok: true }
}
