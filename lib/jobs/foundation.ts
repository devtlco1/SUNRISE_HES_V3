/**
 * Job queue foundation — types only.
 *
 * Phase 2: wire Redis/BullMQ/Celery (or equivalent) and Python workers.
 * See docs/job-queue-foundation.md.
 */

/** Logical operation a queued meter job may perform (extend over time). */
export type QueuedMeterOperation = "readIdentity"

export type MeterReadJobStatus = "pending" | "running" | "completed" | "failed"

/**
 * Placeholder shape for a persisted or enqueued read job.
 * Workers will live in the Python runtime / separate worker process — not in Next.js API routes.
 */
export interface MeterReadJobPlaceholder {
  id: string
  meterId: string
  operation: QueuedMeterOperation
  status: MeterReadJobStatus
  /** Future: Bull job id, Celery task id, SQS message id, … */
  queueRef?: string
  createdAtIso?: string
  finishedAtIso?: string
}
