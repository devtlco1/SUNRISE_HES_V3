import type { CommandGroup, OperatorTargetType } from "@/types/command-operator"
import type { MeterListRow } from "@/types/meter"

function meterLabel(m: MeterListRow): string {
  return `${m.serialNumber} (${m.id})`
}

function unknownIds(
  meterIds: string[],
  metersById: Map<string, MeterListRow>
): string[] {
  return meterIds.filter((id) => !metersById.has(id))
}

export function resolveRunTargetSummary(input: {
  targetType: OperatorTargetType
  meterIds: string[]
  groupId: string | null
  group: CommandGroup | null
  metersById: Map<string, MeterListRow>
}): { meterIds: string[]; targetSummary: string } {
  const { targetType, groupId, group, metersById } = input

  if (targetType === "saved_group") {
    if (!groupId || !group || group.id !== groupId) {
      return { meterIds: [], targetSummary: "Invalid saved group" }
    }
    const meterIds = [...group.memberMeterIds]
    const unk = unknownIds(meterIds, metersById)
    if (unk.length > 0) {
      return {
        meterIds,
        targetSummary: `Group has unknown meter id(s): ${unk.slice(0, 3).join(", ")}${unk.length > 3 ? "…" : ""}`,
      }
    }
    return {
      meterIds,
      targetSummary: `Group "${group.name}" · ${meterIds.length} meter(s)`,
    }
  }

  const meterIds = [...input.meterIds]
  const unk = unknownIds(meterIds, metersById)
  if (unk.length > 0) {
    return {
      meterIds,
      targetSummary: `Unknown meter id(s): ${unk.slice(0, 3).join(", ")}${unk.length > 3 ? "…" : ""}`,
    }
  }

  if (targetType === "single_meter") {
    const id = meterIds[0]
    if (!id) return { meterIds: [], targetSummary: "No meter selected" }
    const m = metersById.get(id)
    return {
      meterIds: [id],
      targetSummary: m ? meterLabel(m) : id,
    }
  }

  if (targetType === "selected_meters") {
    if (meterIds.length === 0)
      return { meterIds: [], targetSummary: "No meters selected" }
    const labels = meterIds
      .slice(0, 2)
      .map((id) => metersById.get(id))
      .filter(Boolean)
      .map((m) => meterLabel(m!))
    const tail = meterIds.length > 2 ? ` +${meterIds.length - 2} more` : ""
    return {
      meterIds,
      targetSummary: `${meterIds.length} meters · ${labels.join(", ")}${tail}`,
    }
  }

  return { meterIds, targetSummary: `${meterIds.length} meter(s)` }
}
