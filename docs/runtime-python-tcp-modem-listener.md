# Inbound modem TCP listener (staged socket + `read-identity` trigger)

## Topology (correct for “modem calls the server”)

Many GPRS/modem setups program the **meter/modem with the HES IP and port**. The **modem initiates TCP** to the server. The server must **listen**, **accept**, **hold** the socket, then the operator (or control plane) **triggers** the protocol session.

This path is implemented **only in the Python sidecar** — not the legacy Next-embedded ingress runtime.

## What this step does

| Piece | Behavior |
| ----- | -------- |
| Listener | Background thread binds `SUNRISE_RUNTIME_TCP_LISTENER_HOST`:`PORT` when `SUNRISE_RUNTIME_TCP_LISTENER_ENABLED=true`. |
| Accept | On inbound connect, **stage one socket** (replace previous with `replaced_by_new_inbound_connection` if needed). **No** MVP-AMI run on accept. |
| Status | `GET /v1/runtime/tcp-listener/status` — bind state, staged remote, timestamps, `lastBindError`, `sessionTriggerInProgress`. |
| Trigger | `POST /v1/runtime/tcp-listener/read-identity` — **pops** staged socket, runs **`MeterClient.run_phase1_tcp_socket`**, same envelope as other `read-identity` paths. **Closes** the socket after the call (modem must reconnect for another attempt). |
| MVP-AMI | Reuses **`run_phase1_tcp_socket`** on the **accepted** socket — **no** `socket.create_connection` for this topology. |

## What this is not

- **Not** outbound TCP client dial (`channel.type: tcp`) — that remains **secondary** for different topologies; see **`docs/runtime-python-tcp-client-read-identity.md`**.
- **Not** `read-basic-registers` / discovery on listener yet — **read-identity only**.
- **Not** auto-running phase1 on every accept (explicit trigger only).

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

## Failure envelopes (trigger)

| `error.code` | When |
| ------------ | ---- |
| `TCP_LISTENER_DISABLED` | Env not enabled |
| `TCP_LISTENER_REQUIRES_MVP_AMI` | Adapter is `stub` |
| `NO_STAGED_TCP_SOCKET` | Nothing to read (modem not connected or socket already consumed) |

Then the same MVP-AMI TCP / IEC / association / identity codes as other TCP paths (`transportMode: tcp_inbound` in details).

## Success

- `diagnostics.detailCode` **`MVP_AMI_IDENTITY_OK_TCP_INBOUND`** when identity read verifies like other paths.
- **Serial** `POST /v1/runtime/read-identity` without listener channel is **unchanged**.

## Next.js (internal)

- `GET /api/internal/python-runtime/tcp-listener/status`
- `POST /api/internal/python-runtime/tcp-listener/read-identity`

## Health

`GET /health` includes compact flags: `tcpModemListenerEnabled`, `tcpModemListenerListening`, `tcpModemListenerBind`, `tcpStagedSocketPresent`, `tcpStagedRemote`.

## Next steps

- Listener + `read-basic-registers` / discovery.
- Optional: keep socket open across multiple operations instead of close-after-trigger.
- Process scale-out (today: **single process**, in-memory staging only).
