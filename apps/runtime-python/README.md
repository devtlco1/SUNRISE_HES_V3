# Sunrise protocol runtime (Python sidecar)

FastAPI service for **on-wire meter protocol** work. The Next.js app remains the **control plane** (UI, permissions, monitoring); this process is the **protocol runtime** direction described in `docs/protocol-runtime-handoff.md` and `docs/architecture-control-plane-python.md`.

## Run locally

```bash
cd apps/runtime-python
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8766 --reload
```

- **Health:** `GET http://127.0.0.1:8766/health`
- **Read identity:** `POST http://127.0.0.1:8766/v1/runtime/read-identity`  
  Body: `{"meterId":"hes-mt-demo-1"}` (stub) or real `mvp_ami` config — see below.
- **Read basic registers:** `POST http://127.0.0.1:8766/v1/runtime/read-basic-registers`  
  Same body shape; `mvp_ami` uses `SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS` (see `docs/runtime-python-mvp-ami-adapter.md`).
- **Discover association object list:** `POST /v1/runtime/discover-supported-obis` — see **`../../docs/runtime-python-discovery.md`**.
- **Read persisted discovery snapshots:** `GET /v1/runtime/discovery-snapshots/{meterId}/latest`, `GET /v1/runtime/discovery-snapshots/{meterId}` (file-backed JSON under `data/discovery-snapshots` by default).
- **Async read jobs (v1, in-process):**  
  `POST /v1/jobs/read-identity` / `POST /v1/jobs/read-basic-registers` → **202** + `jobId`;  
  `GET /v1/jobs/{jobId}` → status + `result` envelope. Not durable. See **`../../docs/job-queue-foundation.md`**.

## Configuration (environment)

| Variable | Description |
| -------- | ----------- |
| `SUNRISE_RUNTIME_HOST` | Bind host (default `0.0.0.0`) |
| `SUNRISE_RUNTIME_PORT` | Bind port (default `8766`) |
| `SUNRISE_RUNTIME_LOG_LEVEL` | e.g. `INFO`, `DEBUG` |
| `SUNRISE_RUNTIME_ADAPTER` | `stub` (default, simulated) or `mvp_ami` (serial via local MVP-AMI checkout) |
| `SUNRISE_RUNTIME_MVP_AMI_ROOT` | **Required for `mvp_ami`:** absolute path to cloned `devtlco1/MVP-AMI` |
| `SUNRISE_RUNTIME_MVP_AMI_CONFIG_PATH` | Optional path to MVP-AMI `config.json` (default `<root>/config.json`) |
| `SUNRISE_RUNTIME_IDENTITY_OBIS` | Optional identity OBIS for `run_phase1` (default `0.0.96.1.1.255`) |
| `SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS` | Comma-separated OBIS for `read-basic-registers` (sensible defaults in `app/config.py`) |
| `SUNRISE_RUNTIME_DISCOVERY_SNAPSHOT_DIR` | Optional root for JSON discovery snapshots (default `data/discovery-snapshots` under this app) |
| `SUNRISE_RUNTIME_DISCOVERY_SNAPSHOT_AUTOSAVE` | `true`/`false` — autosave after successful on-wire discovery (default `true`) |
| `SUNRISE_RUNTIME_DISCOVERY_SNAPSHOT_MAX_HISTORY` | Max history files per meter (default `32`) |
| `SUNRISE_RUNTIME_SERVICE_TOKEN` | If set, `POST /v1/*` requires `Authorization: Bearer <token>`. `GET /health` stays open. |

Full setup and failure codes: **`../../docs/runtime-python-mvp-ami-adapter.md`**.

## Layout

- `app/main.py` — FastAPI app
- `app/config.py` — settings
- `app/schemas/` — Pydantic models (aligned with `types/runtime.ts`)
- `app/routes/` — HTTP routers
- `app/services/` — use-cases
- `app/adapters/` — `ProtocolRuntimeAdapter` (`stub`, `mvp_ami`)

## Next step

Multi-channel TCP, queue execution, and switching the **public** read-identity route to Python are **out of scope** for this milestone; see `docs/protocol-runtime-handoff.md`.
