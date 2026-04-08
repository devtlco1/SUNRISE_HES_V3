"use client"

import { StatusBadge } from "@/components/shared/status-badge"
import type { OperatorRunDisplayStatus } from "@/types/command-operator"

type Props = {
  status: OperatorRunDisplayStatus | string | null | undefined
}

/**
 * Operator run row status: bordered chips consistent with app StatusBadge variants.
 */
export function CommandRunStatusBadge({ status }: Props) {
  const s = (status ?? "").toString().trim().toLowerCase()
  if (s === "completed") return <StatusBadge variant="success">success</StatusBadge>
  if (s === "success")
    return <StatusBadge variant="success">success</StatusBadge>
  if (s === "failed")
    return <StatusBadge variant="danger">failed</StatusBadge>
  if (s === "running")
    return <StatusBadge variant="info">running</StatusBadge>
  if (s === "pending")
    return <StatusBadge variant="neutral">pending</StatusBadge>
  if (!s)
    return (
      <StatusBadge variant="neutral" className="font-normal">
        —
      </StatusBadge>
    )
  return (
    <StatusBadge variant="neutral" className="font-normal">
      {status}
    </StatusBadge>
  )
}
