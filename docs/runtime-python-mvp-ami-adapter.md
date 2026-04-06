# Python sidecar: real `mvp_ami` adapter (serial identity read)

This documents the **first real protocol path**: `SUNRISE_RUNTIME_ADAPTER=mvp_ami`, which delegates to a local checkout of **[MVP-AMI](https://github.com/devtlco1/MVP-AMI)** (`MeterClient.run_phase1`) for **one** identity OBIS read over **serial** (host-initiated, same pipeline as MVP-AMI).

## What is implemented

- Open configured serial port (via MVP-AMI config, optional request override).
- IEC / initial request and DLMS association (inside MVP-AMI).
- Single COSEM read for the configured identity OBIS (default `0.0.96.1.1.255`).
- Response mapped to the existing **`RuntimeResponseEnvelope`** (`ok`, `simulated`, `diagnostics`, etc.).
- `simulated: false` on every `mvp_ami` path; `diagnostics.verifiedOnWire: true` only when association succeeded **and** the identity read returned a value without row error.

## What stays stubbed / out of scope

- **Queues, workers, relay, bulk reads, command execution** — unchanged placeholders elsewhere.
- **TCP client / multi-channel** in the adapter — not implemented; use MVP-AMI’s own `config.json` for transport until extended.
- **Public** `POST /api/runtime/read-identity` — still the in-process TypeScript runtime; only **`POST /api/internal/python-runtime/read-identity`** proxies to Python when `RUNTIME_PYTHON_SIDECAR_URL` is set.

## Prerequisites

1. Clone MVP-AMI next to this repo (or anywhere), e.g.:

   ```bash
   git clone https://github.com/devtlco1/MVP-AMI.git ~/MVP-AMI
   ```

2. A valid **`config.json`** for MVP-AMI (serial port, addressing, keys as your meter requires). The sidecar loads it with MVP-AMI’s `load_config()`.

3. Python deps (includes `pyserial` and Gurux stack used by MVP-AMI):

   ```bash
   cd apps/runtime-python && source .venv/bin/activate && pip install -r requirements.txt
   ```

## Environment variables (Python sidecar)

| Variable | Required for `mvp_ami` | Description |
| -------- | ---------------------- | ----------- |
| `SUNRISE_RUNTIME_ADAPTER` | Yes | Set to `mvp_ami`. |
| `SUNRISE_RUNTIME_MVP_AMI_ROOT` | Yes | Absolute path to the **MVP-AMI repository root** (directory containing `meter_client.py`, `config.py`, etc.). |
| `SUNRISE_RUNTIME_MVP_AMI_CONFIG_PATH` | No | Path to `config.json`. Default: `<MVP_AMI_ROOT>/config.json`. |
| `SUNRISE_RUNTIME_IDENTITY_OBIS` | No | Logical name / identity OBIS string passed to `run_phase1`. Default: `0.0.96.1.1.255`. |
| `SUNRISE_RUNTIME_SERVICE_TOKEN` | No | If set, `Authorization: Bearer <token>` on `/v1/*`. |

## Optional request override (serial port only)

`POST /v1/runtime/read-identity` body may include:

```json
{
  "meterId": "meter-1",
  "channel": { "type": "serial", "devicePath": "/dev/ttyUSB0" }
}
```

When `channel.type` is `serial` and `devicePath` is set, it overrides **`serial.port_primary`** in the loaded MVP-AMI config for that call.

## Run the sidecar

```bash
cd apps/runtime-python
source .venv/bin/activate
export SUNRISE_RUNTIME_ADAPTER=mvp_ami
export SUNRISE_RUNTIME_MVP_AMI_ROOT=/absolute/path/to/MVP-AMI
# optional: export SUNRISE_RUNTIME_MVP_AMI_CONFIG_PATH=/absolute/path/to/config.json
uvicorn app.main:app --host 0.0.0.0 --port 8766
```

- **`GET /health`** — includes `mvpAmiRootConfigured: true` when `SUNRISE_RUNTIME_MVP_AMI_ROOT` exists and is a directory.

## Smoke test (HTTP)

```bash
curl -sS http://127.0.0.1:8766/health | jq .

curl -sS -X POST http://127.0.0.1:8766/v1/runtime/read-identity \
  -H 'Content-Type: application/json' \
  -d '{"meterId":"test-1","channel":{"type":"serial","devicePath":"/dev/ttyUSB0"}}' | jq .
```

Without a meter, expect a **structured failure** (`ok: false`, `simulated: false`, `error.code` such as `SERIAL_OPEN_FAILED`, `IEC_HANDSHAKE_FAILED`, `ASSOCIATION_FAILED`, or `IDENTITY_READ_FAILED`) and **`diagnostics`** / **`error.details.mvpAmiDiagnostics`** for stage-level detail.

## Next.js internal proxy

Set on the Next server:

- `RUNTIME_PYTHON_SIDECAR_URL=http://127.0.0.1:8766`
- `RUNTIME_PYTHON_SIDECAR_TOKEN` if the sidecar uses `SUNRISE_RUNTIME_SERVICE_TOKEN`

Then:

```bash
curl -sS -X POST http://127.0.0.1:3000/api/internal/python-runtime/read-identity \
  -H 'Content-Type: application/json' \
  -d '{"meterId":"test-1"}' | jq .
```

(If `RUNTIME_PYTHON_SIDECAR_URL` is unset, the route returns **503** with `PYTHON_SIDECAR_NOT_CONFIGURED` — by design.)

## Failure codes (honest diagnostics)

| `error.code` (representative) | Meaning |
| ----------------------------- | ------- |
| `MVP_AMI_ROOT_REQUIRED` | `SUNRISE_RUNTIME_MVP_AMI_ROOT` not set. |
| `MVP_AMI_CONFIG_MISSING` / `MVP_AMI_CONFIG_LOAD_FAILED` | Config path / parse issues. |
| `MVP_AMI_IMPORT_FAILED` | MVP-AMI modules could not be imported from the given root. |
| `SERIAL_OPEN_FAILED` | MVP-AMI `open_port` diagnostic not successful. |
| `IEC_HANDSHAKE_FAILED` | MVP-AMI `initial_request` failed. |
| `ASSOCIATION_FAILED` / `ASSOCIATION_NOT_REACHED` / `MVP_AMI_CANCELLED` | Association not completed. |
| `IDENTITY_READ_FAILED` | Association OK but identity OBIS row missing value or has error. |
| `MVP_AMI_RUNTIME_ERROR` | Unexpected exception from `run_phase1`. |
