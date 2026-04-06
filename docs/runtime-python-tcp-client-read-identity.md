# TCP client / modem channel — `read-identity` only (experimental)

## Baseline

- **Serial** (`MeterClient.run_phase1`) remains the **proven** production-style path (host → RS-485 / local serial).
- **TCP client** uses MVP-AMI’s **`MeterClient.run_phase1_tcp_socket`**: outbound `socket.create_connection` to `host:port`, then the same **IEC-over-bytes** + **Gurux HDLC association** + **OBIS read** pipeline as the TCP listener POC, but as a **client** to a modem or transparent GPRS tunnel.

This step implements **only** `POST /v1/runtime/read-identity` over TCP. **`read-basic-registers`**, discovery, and jobs beyond identity are still **serial-only** unless extended later.

## Request shape

`channel.type` must be **`tcp`** or **`tcp_client`** (aliases). **`host`** and **`port`** are required.

```json
{
  "meterId": "meter-1",
  "channel": {
    "type": "tcp",
    "host": "192.0.2.10",
    "port": 4059,
    "connectTimeoutSeconds": 20
  }
}
```

| Field | Required | Notes |
| ----- | -------- | ----- |
| `type` | Yes | `tcp` or `tcp_client` |
| `host` | Yes | TCP target (modem IP / tunnel endpoint) |
| `port` | Yes | 1–65535 |
| `connectTimeoutSeconds` | No | Overrides `SUNRISE_RUNTIME_TCP_CLIENT_CONNECT_TIMEOUT_SECONDS` (default **15** s) |

Serial override is unchanged: `channel.type: "serial"` + optional `devicePath`.

## Environment

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `SUNRISE_RUNTIME_TCP_CLIENT_CONNECT_TIMEOUT_SECONDS` | `15` | TCP connect timeout when `connectTimeoutSeconds` is omitted |

Other MVP-AMI env vars (`SUNRISE_RUNTIME_MVP_AMI_ROOT`, config path, `SUNRISE_RUNTIME_IDENTITY_OBIS`, etc.) apply unchanged.

## Prerequisites

- MVP-AMI checkout must include **`run_phase1_tcp_socket`** on `MeterClient` (current `devtlco1/MVP-AMI` main). If missing, the sidecar returns **`MVP_AMI_TCP_SOCKET_API_MISSING`** (structured `ok: false`).

## Diagnostics / error codes (TCP)

| `error.code` | Meaning |
| ------------ | ------- |
| `CHANNEL_TCP_INVALID` | Missing/invalid `host` or `port` |
| `TCP_CONNECT_FAILED` | `socket.create_connection` failed (refused, timeout, DNS, …). Details: `tcpEndpoint`, `connectTimeoutSeconds`, `error`. |
| `MVP_AMI_TCP_SOCKET_API_MISSING` | MVP-AMI too old for TCP client API |
| `MVP_AMI_TCP_RUNTIME_ERROR` | Exception inside `run_phase1_tcp_socket` |
| `MVP_AMI_TCP_PHASE1_RUNTIME_ERROR` | MVP-AMI caught internal TCP phase error (`phase1_runtime_tcp` diagnostic) |
| `IEC_HANDSHAKE_FAILED` | Same as serial — IEC / `initial_request` failed on the byte stream |
| `ASSOCIATION_FAILED` / `ASSOCIATION_NOT_REACHED` | DLMS association did not complete |
| `IDENTITY_READ_FAILED` | Association OK but identity OBIS row missing/failed |

Successful TCP identity reads use **`diagnostics.detailCode`:** `MVP_AMI_IDENTITY_OK_TCP_CLIENT` (serial remains `MVP_AMI_IDENTITY_OK`). Envelope fields are unchanged.

`error.details.transportMode` is **`tcp_client`** or **`serial`** where applicable for cross-comparison in logs.

## Honesty

- TCP client identity is **experimental**: success still requires a real modem path and meter behavior; do not treat parity with serial as guaranteed until proven on your hardware.
- **No fake success**: connect/association/read failures return **`ok: false`** with explicit codes.

## Next.js

`POST /api/internal/python-runtime/read-identity` forwards JSON as-is; pass the same `channel` object. No UI changes in this step.

## Next steps (out of scope here)

- TCP for `read-basic-registers` and discovery (reuse `run_phase1_tcp_socket` or a shared transport wrapper).
- Durable queue workers dialing TCP per job.
- Connection pooling / keep-alive policies for GPRS.
