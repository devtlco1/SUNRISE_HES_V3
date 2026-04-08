import type {
  CommandActionGroup,
  CommandActionGroupMode,
  OperatorActionType,
} from "@/types/command-operator"

export function actionModeToOperatorAction(
  mode: CommandActionGroupMode
): OperatorActionType {
  if (mode === "relay_on") return "relay_on"
  if (mode === "relay_off") return "relay_off"
  return "read"
}

export function validateActionGroupShape(input: {
  actionMode: CommandActionGroupMode
  objectCodes: string[]
}): { ok: true } | { ok: false; error: string } {
  if (input.actionMode === "read_catalog") {
    if (input.objectCodes.length === 0) {
      return {
        ok: false,
        error: "READ_CATALOG_REQUIRES_OBJECT_CODES",
      }
    }
    return { ok: true }
  }
  if (input.objectCodes.length > 0) {
    return {
      ok: false,
      error: "RELAY_GROUPS_MUST_NOT_INCLUDE_OBJECT_CODES",
    }
  }
  return { ok: true }
}

export function assertActionGroupForApi(
  row: CommandActionGroup
): { ok: true } | { ok: false; error: string } {
  return validateActionGroupShape({
    actionMode: row.actionMode,
    objectCodes: row.objectCodes,
  })
}
