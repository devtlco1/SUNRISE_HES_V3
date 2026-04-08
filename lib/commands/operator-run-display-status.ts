import type {
  OperatorCommandRun,
  OperatorRunDisplayStatus,
} from "@/types/command-operator"

/**
 * Operator-facing status: queued → pending; partial batch → failed (never success).
 */
export function operatorRunDisplayStatus(
  run: Pick<OperatorCommandRun, "status" | "perMeterResults">
): OperatorRunDisplayStatus {
  switch (run.status) {
    case "draft":
    case "queued":
      return "pending"
    case "running":
      return "running"
    case "failed":
    case "cancelled":
      return "failed"
    case "completed": {
      const pr = run.perMeterResults
      if (!pr || pr.length === 0) return "success"
      return pr.every((p) => p.state === "success") ? "success" : "failed"
    }
    default:
      return "failed"
  }
}
