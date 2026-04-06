# Inbound TCP meter ingress (listener)

This deployment expects the **meter (or field gateway) to open the TCP connection** to the HES server. The server therefore runs an **ingress listener** alongside the Next.js HTTP server. This is distinct from the **outbound probe** path (`RUNTIME_PROBE_*`), which remains a separate diagnostic tool for reachability from the server.

## Why listener mode

- Field topology: meter is configured with server IP/port and **initiates** TCP.
- The web UI does **not** speak DLMS; the Node runtime owns the socket lifecycle.
- **Inbound bytes are not proof of DLMS association** until a real parser validates AARQ/AARE and COSEM on that stream.

## Environment variables

| Variable | Purpose |
| -------- | ------- |
| `RUNTIME_TCP_METER_INGRESS_ENABLED` | `true` / `1` / `yes` to start the listener at process boot (via `instrumentation.ts`). |
| `RUNTIME_TCP_METER_INGRESS_HOST` | Bind address; default `0.0.0.0` if unset (all IPv4 interfaces). |
| `RUNTIME_TCP_METER_INGRESS_PORT` | **Required** when ingress is enabled: TCP port 1–65535. |
| `RUNTIME_TCP_METER_INGRESS_SOCKET_TIMEOUT_SECONDS` | Idle timeout per accepted socket (default `120`). |
| `INTERNAL_API_TOKEN` | Reserved for future authenticated internal ingest/API hooks (not required for ingress status today). |

Do **not** commit production host/port values. Configure on the VPS only (PM2, systemd, or gitignored env file).

## Process model

- The listener starts in **`instrumentation.ts`** when the Node server boots (`next start` / `next dev`).
- Each Node **worker** process would bind its own listener if you use multiple workers—avoid duplicate binds on the same port (single worker or one ingress process is the usual pattern).
- The HTTP app is not blocked; the TCP server is asynchronous.
- Ingress diagnostics are stored on **`globalThis`** so they stay consistent with the real listener when Next.js loads instrumentation and API routes as separate bundles (same OS process, one shared runtime object).

## Diagnostics

- **GET** `/api/runtime/ingress/status` — JSON with env-derived `config` and live `status` (listener state, last remote peer, byte counts, heuristic session class, disclaimer).
- Server logs prefixed with `[meter-ingress]` for bind, accept, close, and errors.

### Session classification (heuristic only)

Observational values include: `tcp_connected`, `bytes_received`, `hdlc_unclassified`, `hdlc_candidate`, `dlms_not_verified` (when `0x7E` suggests possible HDLC—still **not** verified DLMS). **Association is not attempted** on the inbound path in this release.

## Verify on the VPS

1. Set env and restart the app (see [vps-runtime.md](vps-runtime.md)).
2. Confirm the ingress port is listening:

   ```bash
   ss -ltnp | grep -E ':<INGRESS_PORT>|meter|node'
   ```

3. Fetch status (replace `<app-port>` with the HTTP port, often `3000`):

   ```bash
   curl -sS "http://127.0.0.1:<app-port>/api/runtime/ingress/status" | jq .
   ```

   Expect `status.listening: true` when bind succeeded, `status.ingressEnabled: true`, and `status.disclaimer` explaining that bytes ≠ association.

4. When a meter connects, expect `totalConnectionsAccepted` to increase and `lastRemoteAddress` / `lastSessionClass` to update.

## Code layout

- `lib/runtime/ingress/` — config, state, classifier, TCP listener, future handoff stub (`inbound-handoff.ts`).
- Outbound probe / DLMS harness remains under `lib/runtime/real/` (unchanged as the diagnostic path).

## Next implementation steps (not done here)

- HDLC deframing on the inbound socket.
- IEC 62056 / DLMS association and COSEM reads.
- Internal reading ingest (persistence) behind a separate boundary from protocol execution.
