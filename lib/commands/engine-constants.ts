/** Shown on operator runs driven by the in-process engine. */
export const COMMAND_ENGINE_LIMITS_NOTE =
  "In-process engine (Phase 2): work runs inside the Next.js Node process. Survives browser navigation; a full process restart can strand rows in running/queued until cleared. Not a distributed job runner."

/** When a scheduled fire is skipped because a prior run is still queued or running. */
export const SCHEDULE_OVERLAP_SKIP_NOTE =
  "Skipped scheduled fire: overlap policy — this schedule already has a queued or running operator run."
