# Python sidecar: real `mvp_ami` adapter (serial + optional TCP client)

This documents **`SUNRISE_RUNTIME_ADAPTER=mvp_ami`**: a local checkout of **[MVP-AMI](https://github.com/devtlco1/MVP-AMI)**. **Serial** uses `MeterClient.run_phase1` (open → IEC → association → COSEM reads). **Outbound TCP client** uses `MeterClient.run_phase1_tcp_socket` for **`read-identity`** — see **`docs/runtime-python-tcp-client-read-identity.md`**. **Inbound staged modem listener** uses the same `run_phase1_tcp_socket` on the **accepted** socket for **`read-identity`** and **`read-basic-registers`** — see **`docs/runtime-python-tcp-modem-listener.md`**.

## What is implemented

- Open configured serial port (via MVP-AMI config, optional request `channel.devicePath` override).
- IEC / initial request and DLMS association (inside MVP-AMI).
- **`read-identity`:** one identity OBIS (default `0.0.96.1.1.255` via `SUNRISE_RUNTIME_IDENTITY_OBIS`).
- **`read-basic-registers`:** one `run_phase1` call with a **small comma-separated OBIS list** (`SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS`). Default profile (IEC 62056–style, widely used):
  - **`0.0.1.0.0.255`** — clock / date-time (operational time on the meter).
  - **`1.0.1.8.0.255`** — total active import energy (+A), billing-relevant summary register.
  - **`1.0.32.7.0.255`** — instantaneous voltage L1 (single useful instantaneous quantity).
  Identity is **not** duplicated here; use `read-identity` for logical device name / serial-style reads.
- Per-OBIS outcomes: failed reads appear in `payload.registers[obis].error` with `quality: "error"`; transport/association failures still return `ok: false` for the whole call.
- If **all** OBIS reads fail after association, the envelope is **`ok: false`** (`BASIC_REGISTERS_ALL_FAILED`). If **some** succeed, **`ok: true`** with `diagnostics.detailCode` `MVP_AMI_BASIC_REGISTERS_PARTIAL` or `MVP_AMI_BASIC_REGISTERS_OK`.
- Response mapped to **`RuntimeResponseEnvelope`** (`ok`, `simulated`, `diagnostics`, `operation`, etc.).
- `simulated: false` on every `mvp_ami` path; `diagnostics.verifiedOnWire: true` when association succeeded and **at least one** requested read returned a value without row error (basic registers), or the single identity read succeeded (identity).

## What stays stubbed / out of scope

- **Queues, workers, relay, bulk reads, command execution** — unchanged placeholders elsewhere.
- **Outbound TCP client beyond `read-identity`** — `read-basic-registers` and discovery remain **serial** (or **inbound listener**, not outbound dial) for now.
- **Public** runtime routes — still the in-process TypeScript factory; **`POST /api/internal/python-runtime/read-identity`**, **`read-basic-registers`**, and **`tcp-listener/*`** proxy to Python when `RUNTIME_PYTHON_SIDECAR_URL` is set.
- **Queue execution** — types only (`lib/jobs/foundation.ts`, `apps/runtime-python/app/jobs/read_job_foundation.py`); no Redis/workers yet.

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
| `SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS` | No | Comma-separated OBIS list for `read-basic-registers`. Default: `0.0.1.0.0.255,1.0.1.8.0.255,1.0.32.7.0.255`. |
| `SUNRISE_RUNTIME_SERVICE_TOKEN` | No | If set, `Authorization: Bearer <token>` on `/v1/*`. |
| `SUNRISE_RUNTIME_TCP_CLIENT_CONNECT_TIMEOUT_SECONDS` | No | Default **15** — TCP connect timeout for `read-identity` when `channel.type` is `tcp` / `tcp_client`. |

## Optional request override (serial port only)

`POST /v1/runtime/read-identity` body may include:

```json
{
  "meterId": "meter-1",
  "channel": { "type": "serial", "devicePath": "/dev/ttyUSB0" }
}
```

When `channel.type` is `serial` and `devicePath` is set, it overrides **`serial.port_primary`** in the loaded MVP-AMI config for that call.

## Inbound modem TCP listener (`read-identity` + `read-basic-registers`)

When the **modem dials the server**, enable **`SUNRISE_RUNTIME_TCP_LISTENER_*`** and use **`/v1/runtime/tcp-listener/*`** — **`docs/runtime-python-tcp-modem-listener.md`**. Each trigger **closes** the staged socket when done (reconnect for another attempt).

## TCP client (`read-identity` only)

```json
{
  "meterId": "meter-1",
  "channel": { "type": "tcp", "host": "192.0.2.10", "port": 4059 }
}
```

Full behavior, error codes, and honesty notes: **`docs/runtime-python-tcp-client-read-identity.md`**.

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

curl -sS -X POST http://127.0.0.1:8766/v1/runtime/read-basic-registers \
  -H 'Content-Type: application/json' \
  -d '{"meterId":"test-1"}' | jq .
```

Without a meter, expect a **structured failure** (`ok: false`, `simulated: false`, `error.code` such as `SERIAL_OPEN_FAILED`, `IEC_HANDSHAKE_FAILED`, `ASSOCIATION_FAILED`, identity `IDENTITY_READ_FAILED`, or basic registers `BASIC_REGISTERS_ALL_FAILED`) and **`diagnostics`** / **`error.details.mvpAmiDiagnostics`** where applicable.

## Next.js internal proxy

Set on the Next server:

- `RUNTIME_PYTHON_SIDECAR_URL=http://127.0.0.1:8766`
- `RUNTIME_PYTHON_SIDECAR_TOKEN` if the sidecar uses `SUNRISE_RUNTIME_SERVICE_TOKEN`

Then:

```bash
curl -sS -X POST http://127.0.0.1:3000/api/internal/python-runtime/read-identity \
  -H 'Content-Type: application/json' \
  -d '{"meterId":"test-1"}' | jq .

curl -sS -X POST http://127.0.0.1:3000/api/internal/python-runtime/read-basic-registers \
  -H 'Content-Type: application/json' \
  -d '{"meterId":"test-1"}' | jq .
```

(If `RUNTIME_PYTHON_SIDECAR_URL` is unset, these routes return **503** with `PYTHON_SIDECAR_NOT_CONFIGURED` — by design.)

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
| `BASIC_REGISTERS_OBIS_EMPTY` | Configured OBIS list empty (misconfiguration). |
| `BASIC_REGISTERS_ALL_FAILED` | Association OK but every OBIS in the basic set failed (see `error.details`). |
| `MVP_AMI_RUNTIME_ERROR` | Unexpected exception from `run_phase1`. |
