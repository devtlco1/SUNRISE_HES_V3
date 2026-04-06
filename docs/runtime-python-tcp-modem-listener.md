# Inbound modem TCP listener (staged socket + explicit triggers)

## Topology (correct for “modem calls the server”)

Many GPRS/modem setups program the **meter/modem with the HES IP and port**. The **modem initiates TCP** to the server. The server must **listen**, **accept**, **hold** the socket, then the operator (or control plane) **triggers** the protocol session.

This path is implemented **only in the Python sidecar** — not the legacy Next-embedded ingress runtime.

## What this step does

| Piece | Behavior |
| ----- | -------- |
| Listener | Background thread binds `SUNRISE_RUNTIME_TCP_LISTENER_HOST`:`PORT` when `SUNRISE_RUNTIME_TCP_LISTENER_ENABLED=true`. |
| Accept | On inbound connect, **stage one socket** (replace previous with `replaced_by_new_inbound_connection` if needed). **No** MVP-AMI run on accept. |
| Status | `GET /v1/runtime/tcp-listener/status` — bind state, staged remote, timestamps, `lastBindError`, `sessionTriggerInProgress`, **`lastTcpListenerTrigger`** (last completed trigger summary). |
| Trigger identity | `POST /v1/runtime/tcp-listener/read-identity` — **pops** staged socket, runs **`MeterClient.run_phase1_tcp_socket`**, same envelope as other `read-identity` paths. **Closes** the socket after the call (modem must reconnect for another attempt). |
| Trigger basic registers | `POST /v1/runtime/tcp-listener/read-basic-registers` — same staging/pop/close pattern; runs the **same multi-OBIS basic-registers path** as serial (`SUNRISE_RUNTIME_BASIC_REGISTERS_OBIS`), including **partial success** and per-OBIS errors. |
| MVP-AMI | Reuses **`run_phase1_tcp_socket`** on the **accepted** socket — **no** `socket.create_connection` for this topology. |

## What this is not

- **Not** outbound TCP client dial (`channel.type: tcp`) — that remains **secondary** for different topologies; see **`docs/runtime-python-tcp-client-read-identity.md`**.
- **Not** auto-running phase1 on every accept (explicit trigger only).
- **Not** keeping the socket open across multiple operations in this step — each trigger **consumes** the staged socket and **closes** it when finished. A later step may add “keep socket open”.

## Environment (Python)

| Variable | Default | Description |
| -------- | ------- | ----------- |
| `SUNRISE_RUNTIME_TCP_LISTENER_ENABLED` | `false` | Master switch. |
| `SUNRISE_RUNTIME_TCP_LISTENER_HOST` | `0.0.0.0` | Bind address. |
| `SUNRISE_RUNTIME_TCP_LISTENER_PORT` | `4059` | Listen port (**not** the FastAPI `SUNRISE_RUNTIME_PORT`, usually `8766`). |
| `SUNRISE_RUNTIME_TCP_LISTENER_BACKLOG` | `8` | `listen()` backlog. |

Requires **`SUNRISE_RUNTIME_ADAPTER=mvp_ami`** and MVP-AMI with **`run_phase1_tcp_socket`**.

## HTTP (sidecar)

| Method | Path | Auth |
| ------ | ---- | ---- |
| `GET` | `/v1/runtime/tcp-listener/status` | Bearer if `SERVICE_TOKEN` set |
| `POST` | `/v1/runtime/tcp-listener/read-identity` | Same; body = `ReadIdentityRequest` (`meterId`, …) |
| `POST` | `/v1/runtime/tcp-listener/read-basic-registers` | Same; body = `ReadBasicRegistersRequest` (`meterId`, …) |

## Failure envelopes (trigger)

| `error.code` | When |
| ------------ | ---- |
| `TCP_LISTENER_DISABLED` | Env not enabled |
| `TCP_LISTENER_REQUIRES_MVP_AMI` | Adapter is not `mvp_ami` |
| `NO_STAGED_TCP_SOCKET` | Nothing to read (modem not connected or socket already consumed) |

Then the same MVP-AMI TCP / IEC / association / read codes as other TCP paths (`transportMode: tcp_inbound` in details). For basic registers, **`BASIC_REGISTERS_ALL_FAILED`** applies when association succeeded but every OBIS read failed (same as serial).

## Success

- Identity: `diagnostics.detailCode` **`MVP_AMI_IDENTITY_OK_TCP_INBOUND`** when identity read verifies like other paths.
- Basic registers: **`MVP_AMI_BASIC_REGISTERS_OK_TCP_INBOUND`** or **`MVP_AMI_BASIC_REGISTERS_PARTIAL_TCP_INBOUND`** (partial success preserved).
- **Serial** `POST /v1/runtime/read-identity` and **`POST /v1/runtime/read-basic-registers`** are **unchanged**.

## `lastTcpListenerTrigger` (status)

After each trigger completes, status includes a snapshot such as:

- `operation`, `ok`, `detailCode`, `message`, `remoteEndpoint`, `transportMode: tcp_inbound`
- `socketTeardown` (e.g. `server_closed_after_trigger` after normal completion)
- `diagnosticsSummary` (transport/association/verified flags)
- `mvpAmiStages` when failure details include `mvpAmiDiagnostics`
- `hints` with optional booleans for IEC (`initial_request`), TCP phase1 runtime, `association`, `read_obis`
- For basic registers: `basicRegistersSummary` (`okCount`, `total`, `partial`, `allFailed`)

## Next.js (internal)

- `GET /api/internal/python-runtime/tcp-listener/status`
- `POST /api/internal/python-runtime/tcp-listener/read-identity`
- `POST /api/internal/python-runtime/tcp-listener/read-basic-registers`

## Health

`GET /health` includes compact flags: `tcpModemListenerEnabled`, `tcpModemListenerListening`, `tcpModemListenerBind`, `tcpStagedSocketPresent`, `tcpStagedRemote`.

## Proven baseline

**Serial** remains the proven fallback for routine work. Inbound listener is the right fit when the modem is configured to dial **this** host.

## Next steps

- Optional: keep socket open across multiple operations instead of close-after-trigger.
- Process scale-out (today: **single process**, in-memory staging only).
