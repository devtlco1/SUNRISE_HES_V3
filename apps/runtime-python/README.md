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
- **Read identity (stub):** `POST http://127.0.0.1:8766/v1/runtime/read-identity`  
  Body: `{"meterId":"hes-mt-demo-1"}`

## Configuration (environment)

| Variable | Description |
| -------- | ----------- |
| `SUNRISE_RUNTIME_HOST` | Bind host (default `0.0.0.0`) |
| `SUNRISE_RUNTIME_PORT` | Bind port (default `8766`) |
| `SUNRISE_RUNTIME_LOG_LEVEL` | e.g. `INFO`, `DEBUG` |
| `SUNRISE_RUNTIME_ADAPTER` | `stub` (default) or `mvp_ami` (not wired — returns not-implemented envelope) |
| `SUNRISE_RUNTIME_SERVICE_TOKEN` | If set, `POST /v1/*` requires `Authorization: Bearer <token>`. `GET /health` stays open. |

## Layout

- `app/main.py` — FastAPI app
- `app/config.py` — settings
- `app/schemas/` — Pydantic models (aligned with `types/runtime.ts`)
- `app/routes/` — HTTP routers
- `app/services/` — use-cases
- `app/adapters/` — `ProtocolRuntimeAdapter` implementations (`stub`, future MVP-AMI)

## Next step

Implement `MvpAmiRuntimeAdapter.read_identity` using the MVP-AMI repo, or serial/TCP client code, and point the Next.js internal proxy at this service (`RUNTIME_PYTHON_SIDECAR_URL`).
