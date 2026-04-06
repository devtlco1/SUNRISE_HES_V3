/**
 * Job queue foundation — types only.
 *
 * v1: Python in-process queue is live (`docs/job-queue-foundation.md`). Phase 2: Redis/BullMQ/Celery.
 * See docs/job-queue-foundation.md.
 */

/** Logical operation a queued meter job may perform (extend over time). */
export type QueuedMeterOperation = "readIdentity" | "readBasicRegisters"

/** Matches Python v1 local queue + future durable implementations. */
export type MeterReadJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"

/**
 * Shape for a read job record (v1: poll Python `GET /v1/jobs/{jobId}` via internal proxy).
 */
export interface MeterReadJobPlaceholder {
  id: string
  meterId: string
  operation: QueuedMeterOperation
  status: MeterReadJobStatus
  /** v1: same as `id` (UUID). Later: Bull/Celery/SQS id. */
  queueRef?: string
  createdAtIso?: string
  finishedAtIso?: string
}
