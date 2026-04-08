import { readCommandGroupsRaw } from "@/lib/commands/operator-file"
import { normalizeCommandGroups } from "@/lib/commands/operator-normalize"
import { resolveRunTargetSummary } from "@/lib/commands/resolve-run-target"
import { readMetersJsonRaw } from "@/lib/meters/meters-file"
import { normalizeMeterRows } from "@/lib/meters/normalize"
import type {
  CommandGroup,
  OperatorTargetType,
} from "@/types/command-operator"
import type { MeterListRow } from "@/types/meter"

export type ResolvedCommandContext =
  | {
      ok: true
      meterIds: string[]
      targetSummary: string
      groupId: string | null
      metersById: Map<string, MeterListRow>
    }
  | { ok: false; error: string }

export async function resolveCommandExecutionContext(input: {
  targetType: OperatorTargetType
  meterIds: string[]
  groupId: string | null
}): Promise<ResolvedCommandContext> {
  const metersRaw = await readMetersJsonRaw()
  if (!metersRaw.ok) {
    return { ok: false, error: metersRaw.error }
  }
  const meters = normalizeMeterRows(metersRaw.parsed)
  const metersById = new Map(meters.map((m) => [m.id, m]))

  let group: CommandGroup | null = null
  if (input.targetType === "saved_group") {
    const graw = await readCommandGroupsRaw()
    if (!graw.ok) {
      return { ok: false, error: graw.error }
    }
    const groups = normalizeCommandGroups(graw.parsed)
    group = input.groupId
      ? groups.find((g) => g.id === input.groupId) ?? null
      : null
  }

  const resolved = resolveRunTargetSummary({
    targetType: input.targetType,
    meterIds: input.meterIds,
    groupId: input.groupId,
    group,
    metersById,
  })

  if (
    resolved.targetSummary.includes("Invalid") ||
    resolved.targetSummary.includes("unknown") ||
    resolved.targetSummary.startsWith("No meter") ||
    resolved.targetSummary.startsWith("No meters")
  ) {
    return { ok: false, error: resolved.targetSummary }
  }

  if (resolved.meterIds.length === 0) {
    return { ok: false, error: resolved.targetSummary || "EMPTY_TARGET" }
  }

  return {
    ok: true,
    meterIds: resolved.meterIds,
    targetSummary: resolved.targetSummary,
    groupId: input.groupId,
    metersById,
  }
}
