# Job queue & workers — foundation (placeholder)

## Status

**Not implemented.** This document and `lib/jobs/` define **where** async meter work will live **after** the Python sidecar proves single-request reads.

## Intended direction (later phase)

- **Producer:** Next.js (or a small worker process) enqueues **read jobs** and **command jobs** when operators or schedules trigger work.
- **Queue:** Redis + BullMQ, Celery + Redis/RabbitMQ, or cloud-native queues — **decision deferred**.
- **Consumers:** **Python workers** (same repo image or sibling package) that call the protocol runtime adapter stack — **not** the Next.js HTTP thread.

## Concepts (domain)

| Concept | Description |
| ------- | ----------- |
| **MeterReadJob** | Unit of work: e.g. `readIdentity`, later `readRegisters`, keyed by `meterId` + channel config |
| **Job lifecycle** | `pending` → `running` → `completed` \| `failed` |
| **queueRef** | Opaque id returned by the queue implementation (Bull job id, Celery task id, …) |

## Code placeholder

See `lib/jobs/foundation.ts` for TypeScript types only — no Redis, no workers, no background timers in this step.

## What stays in Next.js after queues exist

- Dashboards, alerts, permissions, job **metadata** and **status APIs** fed by worker results.
- **No** long-running socket ownership in the Next server process for production reads.
