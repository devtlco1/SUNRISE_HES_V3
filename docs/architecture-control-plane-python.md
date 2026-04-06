# Control plane (Next.js) + protocol runtime (Python)

## Roles

| Layer | Responsibility |
| ----- | ---------------- |
| **Next.js** | UI, monitoring, alerts, command workflows, permissions, operator status, **server-side** orchestration calls |
| **Python sidecar** (`apps/runtime-python`) | Meter protocol I/O, DLMS/COSEM session execution, MVP-AMI-class behavior (as implemented) |
| **Queue / workers** | **Later phase** — async meter reads and scheduled commands; see `docs/job-queue-foundation.md` |

## Current integration (foundation)

1. Python **FastAPI** listens on `SUNRISE_RUNTIME_PORT` (default **8766**).
2. Next.js calls the sidecar **only from the server** via `lib/runtime/python-sidecar/client.ts`.
3. **Internal** route: `POST /api/internal/python-runtime/read-identity` — proxies to Python `POST /v1/runtime/read-identity`.
4. The public `POST /api/runtime/read-identity` route is **unchanged** (still uses the in-process TypeScript adapter factory). UI is not switched to the sidecar in this step.

## Environment (Next.js server)

| Variable | Purpose |
| -------- | ------- |
| `RUNTIME_PYTHON_SIDECAR_URL` | Base URL, e.g. `http://127.0.0.1:8766` |
| `RUNTIME_PYTHON_SIDECAR_TOKEN` | Optional Bearer token; must match Python `SUNRISE_RUNTIME_SERVICE_TOKEN` when set |

Optional protection on the Next internal route: `INTERNAL_API_TOKEN` (same pattern as other internal hooks).

## Historical ingress

Inbound TCP ingress diagnostics in this repo **remain** for evidence and troubleshooting; they are **not** the primary production read path. See `docs/runtime-ingress.md` and `docs/protocol-runtime-handoff.md`.

## TypeScript build note (local `node_modules`)

If `next build` / `tsc` fails with **Cannot find type definition file for 'estree 2'** (or similar names with a space), the workspace may contain corrupted duplicate folders under `node_modules/@types/` (e.g. `estree 2`). Remove those directories or run a clean **`rm -rf node_modules && npm ci`**.
