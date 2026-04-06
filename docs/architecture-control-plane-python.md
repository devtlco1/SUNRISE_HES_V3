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
3. **Internal** routes (server-only, when `RUNTIME_PYTHON_SIDECAR_URL` is set):
   - `POST /api/internal/python-runtime/read-identity` → Python `POST /v1/runtime/read-identity` (sync)
   - `POST /api/internal/python-runtime/read-basic-registers` → **catalog gate** (latest discovery snapshot vs `SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS` on Next) → Python `POST /v1/runtime/read-basic-registers` (sync); **409** if no/incompatible snapshot (`docs/runtime-python-discovery.md`)
   - `POST /api/internal/python-runtime/discover-supported-obis` → Python `POST /v1/runtime/discover-supported-obis` (association object list — see **`docs/runtime-python-discovery.md`**)
   - `GET /api/internal/python-runtime/discovery-snapshots/[meterId]/latest` → Python `GET /v1/runtime/discovery-snapshots/{meterId}/latest` (persisted JSON snapshot)
   - `GET /api/internal/python-runtime/discovery-snapshots/[meterId]` → Python `GET /v1/runtime/discovery-snapshots/{meterId}` (snapshot index)
   - **Async jobs (v1 local queue):**  
     `POST .../jobs/read-identity` → Python `POST /v1/jobs/read-identity` (**202** + `jobId`),  
     `POST .../jobs/read-basic-registers` → same catalog gate → Python `POST /v1/jobs/read-basic-registers`,  
     `GET .../jobs/[jobId]` → Python `GET /v1/jobs/{jobId}`  
     See **`docs/job-queue-foundation.md`**.
4. Public `POST /api/runtime/read-identity` and `POST /api/runtime/read-basic-registers` remain **unchanged** (in-process TypeScript adapter factory). The UI is not switched to the sidecar by default.

## Real adapter: `mvp_ami` (serial reads)

With `SUNRISE_RUNTIME_ADAPTER=mvp_ami` and `SUNRISE_RUNTIME_MVP_AMI_ROOT` set to a local **[MVP-AMI](https://github.com/devtlco1/MVP-AMI)** checkout, the sidecar runs the same host-initiated serial pipeline (open → IEC → association → COSEM reads) for:

- **`read-identity`** — one identity OBIS (default `0.0.96.1.1.255`); serial (`run_phase1`) or **TCP client** (`run_phase1_tcp_socket`) when `channel.type` is `tcp` / `tcp_client` — see **`docs/runtime-python-tcp-client-read-identity.md`**.
- **`read-basic-registers`** — a **small fixed OBIS set** (clock, energy, voltage — configurable; see **`docs/runtime-python-mvp-ami-adapter.md`**).

Both return the same **`RuntimeResponseEnvelope`** shape as the stub (`operation` discriminates the payload). Env vars and curl examples: **`docs/runtime-python-mvp-ami-adapter.md`**.

## Environment (Next.js server)

| Variable | Purpose |
| -------- | ------- |
| `RUNTIME_PYTHON_SIDECAR_URL` | Base URL, e.g. `http://127.0.0.1:8766` |
| `RUNTIME_PYTHON_SIDECAR_TOKEN` | Optional Bearer token; must match Python `SUNRISE_RUNTIME_SERVICE_TOKEN` when set |
| `SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS` | Optional on **Next** (server): comma-separated OBIS for catalog checks on internal `read-basic-registers`; default matches Python (`docs/runtime-python-mvp-ami-adapter.md`) |

Optional protection on the Next internal route: `INTERNAL_API_TOKEN` (same pattern as other internal hooks).

## Historical ingress

Inbound TCP ingress diagnostics in this repo **remain** for evidence and troubleshooting; they are **not** the primary production read path. See `docs/runtime-ingress.md` and `docs/protocol-runtime-handoff.md`.

## TypeScript build note (local `node_modules`)

If `next build` / `tsc` fails with **Cannot find type definition file for 'estree 2'** (or similar names with a space), the workspace may contain corrupted duplicate folders under `node_modules/@types/` (e.g. `estree 2`). Remove those directories or run a clean **`rm -rf node_modules && npm ci`**.
