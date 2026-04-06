# Job queue & workers

## v1: local in-process queue (current)

The Python sidecar implements a **minimal, honest** async execution path:

| Property | Reality |
| -------- | ------- |
| **Storage** | In-memory `dict` + `threading.Queue` in the **same process** as FastAPI |
| **Durability** | **None** — restart drops queued and completed jobs |
| **Concurrency** | One job runs at a time (single worker thread, FIFO) |
| **Execution** | Worker calls **`execute_read_identity`** / **`execute_read_basic_registers`** — same code as direct `POST /v1/runtime/*` |
| **Replacement** | Designed to swap for Redis + dedicated workers without changing envelope contracts |

### Python endpoints (`SUNRISE_RUNTIME_SERVICE_TOKEN` when set)

| Method | Path | Purpose |
| ------ | ---- | ------- |
| `POST` | `/v1/jobs/read-identity` | Enqueue read-identity (body = `ReadIdentityRequest`). Returns **202** + `jobId`, `status: "queued"`. |
| `POST` | `/v1/jobs/read-basic-registers` | Enqueue read-basic-registers. **202** + `jobId`. |
| `GET` | `/v1/jobs/{jobId}` | Poll status: `queued` → `running` → `succeeded` \| `failed`. |

### Job lifecycle & fields

- **`queued`** — accepted, waiting for worker.
- **`running`** — worker thread executing the read service.
- **`succeeded`** — worker finished without exception; **`result`** is the full **`RuntimeResponseEnvelope`** JSON (meter may still report `ok: false` in that envelope).
- **`failed`** — uncaught exception in the worker; **`error`** holds the message; no protocol envelope.

Timestamps: **`createdAt`**, optional **`startedAt`**, optional **`finishedAt`** (ISO-8601 UTC with `Z`).

Completed jobs are evicted after **500** finished records (oldest first) to cap memory.

### Next.js internal proxies

Server-only (same auth/token pattern as direct read proxies):

- `POST /api/internal/python-runtime/jobs/read-identity` → **202** + enqueue body.
- `POST /api/internal/python-runtime/jobs/read-basic-registers` → discovery-snapshot catalog gate → **202** (or **409** `CATALOG_READ_BLOCKED` if no/incompatible snapshot; see **`docs/runtime-python-discovery.md`**).
- `GET /api/internal/python-runtime/jobs/[jobId]` → job record.

Direct route **`POST /api/internal/python-runtime/read-identity`** is unchanged (synchronous sidecar). **`read-basic-registers`** internal sync route applies the same catalog gate before the sidecar call.

## Future phase (not v1)

- **Producer:** Next or a separate scheduler enqueues work.
- **Queue:** Redis + BullMQ, Celery, SQS, … — **replaces** `local_read_job_queue.py` with a durable transport.
- **Consumers:** One or more **worker processes** (or the same container with multiple workers) dequeue and still call the **same** read services / adapters.

## Concepts (domain)

| Concept | Description |
| ------- | ----------- |
| **MeterReadJob** | Unit of work: `readIdentity`, `readBasicRegisters` (`QueuedMeterOperation` in `lib/jobs/foundation.ts`) |
| **Job lifecycle (v1 API)** | `queued` → `running` → `succeeded` \| `failed` |
| **jobId** | UUID string; poll until terminal state |

## Code map

| Area | Location |
| ---- | -------- |
| Queue + worker thread | `apps/runtime-python/app/jobs/local_read_job_queue.py` |
| Kind / status enums | `apps/runtime-python/app/jobs/read_job_foundation.py` |
| HTTP job models | `apps/runtime-python/app/schemas/jobs.py` |
| FastAPI routes | `apps/runtime-python/app/routes/jobs_v1.py` |
| TS types | `lib/jobs/foundation.ts`, `lib/runtime/python-sidecar/client.ts` (`PythonReadJob*` types) |

## What stays in Next.js after Redis exists

- Dashboards, permissions, job **metadata** APIs backed by durable queue + DB.
- **No** requirement to run DLMS I/O on the Next HTTP thread for production-scale reads.
