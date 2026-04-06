# Inbound TCP meter ingress (listener)

This deployment expects the **meter (or field gateway) to open the TCP connection** to the HES server. The server therefore runs an **ingress listener** alongside the Next.js HTTP server. This is distinct from the **outbound probe** path (`RUNTIME_PROBE_*`), which remains a separate diagnostic tool for reachability from the server.

## Why listener mode

- Field topology: meter is configured with server IP/port and **initiates** TCP.
- The web UI does **not** speak DLMS; the Node runtime owns the socket lifecycle.
- **TCP bytes alone are not proof** of HDLC FCS validity, association, or COSEM reads. Use `/api/runtime/ingress/status` fields that are explicitly named `verifiedOnWire` / `verified` semantics.

## MVP-AMI vs this ingress (architecture truth)

**Conclusion (evidence-based): the runtimes are not equivalent**, even when HDLC/AARQ bytes match Gurux.

| Aspect | MVP-AMI (reference repo) | SUNRISE inbound ingress (this app) |
| ------ | ------------------------ | ----------------------------------- |
| **Primary documented success path** | Host opens **serial** (`pyserial`); reads and persistence center on `port_used` like `/dev/cu.*` | **TCP server**; meter/gateway **connects in** |
| **TCP path in MVP-AMI** | Optional Stage-8 POC: listener **accepts** and holds `_tcp_conn`; **no** IEC/DLMS until `POST /api/read-tcp` | **Immediate** `runInboundDlmsOnSocket` on `accept()` |
| **IEC before DLMS (TCP)** | `run_phase1_tcp_socket` always runs `_run_iec_handshake_tcp` (`/?!`, server-sent ACK) before association | IEC is **optional** preamble match on first bytes + configured ACK list; timing/order differ |
| **SNRM initiation (vendor broadcast)** | Host **writes** broadcast SNRM, then reads UA | May **answer** meter-originated SNRM with UA, or send SNRM if profile uses broadcast-first |
| **Session trigger** | Operator/API-driven read on TCP | Automatic state machine on connect |

Therefore: **proving AARQ equals Gurux on the wire does not prove** the same **transport + session contract** as MVP-AMI’s successful read (especially serial). Live VPS evidence (strict UA, Gurux-shaped AARQ, **no post-AARQ RX**, server `closed_after_disc_final`) is consistent with a **role/timing/trigger mismatch**, not only a byte-level bug.

**API field:** `status.mvpAmiTopologyComparison` on `GET /api/runtime/ingress/status` repeats this comparison in structured form (`transportEquivalenceAssessment`, `concreteDifferences`, `recommendedNextDirection`).

### VPS evidence — final (inbound TCP)

Live experiments on the deployment meter have **not** produced **post-AARQ** meter RX in either session model:

- **Auto-on-accept** and **`staged_triggered_session`** (API-triggered IEC → ACK → delay → DLMS, see `RUNTIME_TCP_METER_INGRESS_SESSION_MODE`) both end with **`post_aarq_zero_rx`** (or equivalent AARE hunt outcome) and **`closeOrigin: closed_after_disc_final`** after server teardown.
- On-wire checks passed for **strict UA**, learned HDLC address, **Gurux-aligned LOW LN AARQ**, **password match**, and **conservative** initiate profile — so the blocker is **not** a small APDU/password/framing bug.

**Product implication:** further effort should **not** center on incremental TypeScript ingress tweaks for this path. See **[protocol-runtime-handoff.md](protocol-runtime-handoff.md)** for the recommended **control plane (Next.js) + dedicated protocol runtime (e.g. Python/MVP-AMI-class sidecar)** split and migration steps.

## Environment variables — listener

| Variable | Purpose |
| -------- | ------- |
| `RUNTIME_TCP_METER_INGRESS_ENABLED` | `true` / `1` / `yes` to start the listener at process boot (via `instrumentation.ts`). |
| `RUNTIME_TCP_METER_INGRESS_HOST` | Bind address; default `0.0.0.0` if unset (all IPv4 interfaces). |
| `RUNTIME_TCP_METER_INGRESS_PORT` | **Required** when ingress is enabled: TCP port 1–65535. |
| `RUNTIME_TCP_METER_INGRESS_SOCKET_TIMEOUT_SECONDS` | Idle timeout for **passive** preview sockets (default `120`). Active DLMS sessions clear the per-socket idle timer at start. |
| `INTERNAL_API_TOKEN` | Bearer token for **`POST /api/runtime/ingress/start-session`** (staged mode). Not required for **`GET .../ingress/status`**. |
| `RUNTIME_TCP_METER_INGRESS_SESSION_MODE` | `auto_associate_on_accept` (default) or `staged_triggered_session` — see protocol handoff; staged did not change post-AARQ outcome in VPS tests. |
| `RUNTIME_INGRESS_LAST_SESSION_TRACE_PATH` | Optional filesystem path; last bounded session trace JSON is written at session end (mode `600`). Protect this path on the VPS — it contains raw frame hex. |

## Environment variables — inbound DLMS session (vendor profile)

When ingress is enabled, a **vendor-style DLMS session** runs on each accepted socket unless disabled. Baseline defaults match the documented MVP-AMI profile; **override on the VPS** via env. **Do not commit** `RUNTIME_INGRESS_DLMS_PASSWORD` or production endpoints.

| Variable | Purpose |
| -------- | ------- |
| `RUNTIME_INGRESS_DLMS_SESSION_ENABLED` | Set to `false` / `0` to disable the session runner (passive byte preview only). Default: on when ingress is enabled. |
| `RUNTIME_INGRESS_DLMS_AUTH` | `LOW` (default) or `NONE`. `LOW` requires `RUNTIME_INGRESS_DLMS_PASSWORD` on the server. |
| `RUNTIME_INGRESS_DLMS_PASSWORD` | LLS password (server env only). **This env value is what the ingress runtime encodes in the AARQ** — it is not implied by passwords typed into a separate web UI unless that UI writes this env (or your orchestration copies it here). |
| `RUNTIME_INGRESS_DLMS_CLIENT_LOGICAL` | Client logical address (default `1`). |
| `RUNTIME_INGRESS_DLMS_METER_ADDRESS_HEX` | Meter HDLC destination address (hex), e.g. `0002046303`. |
| `RUNTIME_INGRESS_VENDOR_USE_BROADCAST_SNRM_FIRST` | `true`/`false`; default follows MVP baseline (broadcast SNRM first). |
| `RUNTIME_INGRESS_VENDOR_BROADCAST_SNRM_HEX` | Full broadcast SNRM frame (hex). |
| `RUNTIME_INGRESS_VENDOR_IEC_ACK_HEX_LIST` | Comma-separated IEC ACK candidates (hex) for TCP preamble matching. |
| `RUNTIME_INGRESS_VENDOR_AFTER_IEC_SLEEP_MS` | Sleep after IEC ACK match (ms). |
| `RUNTIME_INGRESS_DLMS_READ_TIMEOUT_SECONDS` | Max wait per read burst (seconds, default `2.5`). |
| `RUNTIME_INGRESS_DLMS_READ_IDLE_MS` | Idle gap to end a read burst (default `120`). |
| `RUNTIME_INGRESS_VENDOR_UA_SWAP_ADDRESSES` | Experimental UA addressing when answering meter SNRM. |
| `RUNTIME_INGRESS_VENDOR_SEND_DISC_BEFORE_CLOSE` | Send DISC before closing socket (default true). |
| `RUNTIME_INGRESS_VENDOR_DISC_DRAIN_TIMEOUT_SECONDS` | Drain window after DISC. |
| `RUNTIME_INGRESS_IDENTITY_OBIS` | Identity object OBIS (default `0.0.96.1.1.255`). |
| `RUNTIME_INGRESS_IDENTITY_CLASS_ID` | COSEM class ID (default `1`). |
| `RUNTIME_INGRESS_IDENTITY_ATTRIBUTE_ID` | Attribute id (default `2`). |

## Process model

- The listener starts in **`instrumentation.ts`** when the Node server boots (`next start` / `next dev`).
- Each Node **worker** process would bind its own listener if you use multiple workers—avoid duplicate binds on the same port (single worker or one ingress process is the usual pattern).
- The HTTP app is not blocked; the TCP server is asynchronous.
- Ingress diagnostics are stored on **`globalThis`** so they stay consistent with the real listener when Next.js loads instrumentation and API routes as separate bundles (same OS process, one shared runtime object).

## Diagnostics

- **GET** `/api/runtime/ingress/status` — `config` (listener), `protocolProfile` (non-secret profile snapshot), and `status` (listener + last-session protocol outcomes). Includes **`mvpAmiTopologyComparison`** (static architecture note vs MVP-AMI).
- **`status.inboundProtocolTrace`** — bounded evidence for the current TCP session: timestamped `steps`, `inboundFrames` / `outboundFrames` (full frame hex up to a cap), per-frame FCS-valid parse variants (dest/src lengths 1..8), heuristic `0x73` offsets when FCS does not validate, `lastMeterAccumHexCapped`, `leadingGarbageHex`, `lastIncompleteTailHex`, and summaries (`lastUaCandidateSummary`, `lastFcsValidationNote`). **Do not expose this endpoint to untrusted networks** while debugging (raw meter traffic).
- **`lastOutboundAarqDiagnostic`** (inside the trace) — outbound AARQ payload proof for LOW auth: `configuredPasswordSourceLabel`, plaintext **`configuredPasswordUtf8`** (from `RUNTIME_INGRESS_DLMS_PASSWORD`), **`transmittedPasswordOctetsHex`** / UTF-8 decode **`passwordWireAsUtf8`**, **`configuredUtf8BytesMatchTransmittedOctets`**, **`passwordComparisonNote`**, and **`configuredPasswordSha256Hex`**. Use this to resolve “which password hit the wire” vs operator memory or UI history.
- Optional **trace file** via `RUNTIME_INGRESS_LAST_SESSION_TRACE_PATH` (same JSON, capped size on write).
- Server logs prefixed with `[meter-ingress]` for bind, accept, close, and errors.

### On-wire truth fields (status)

- `inboundAssociationAttempted` / `inboundAssociationVerifiedOnWire` — `true` only when an AARE was found inside a **valid HDLC I-frame** (FCS checked) and `association-result` enum is **0**.
- `inboundIdentityReadAttempted` / `inboundIdentityReadVerifiedOnWire` — `true` only when a **GET-Response-Normal**–shaped APDU is parsed after association (best-effort BER walk; may not cover all meters).
- `lastInboundProtocolPhase` — coarse state machine position for the last connection.

### Session classification (`lastSessionClass`)

Includes heuristic classes (`hdlc_candidate`, `dlms_not_verified`, …) and, when the session runner completes steps, `inbound_association_verified` / `inbound_identity_read_verified` / `inbound_session_failed`.

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

4. When a meter connects, expect counters and protocol fields to update. Confirm `inboundAssociationVerifiedOnWire` and `inboundIdentityReadVerifiedOnWire` only if the meter actually completes those steps on wire.

## Code layout

- `lib/runtime/ingress/` — listener, profile (`inbound-profile.ts`), inbound session (`inbound-dlms-session.ts`), diagnostics state.
- `lib/runtime/real/hdlc-frame-variable.ts` — variable-width HDLC U/I frames (broadcast + 4-byte server address path).
- `lib/runtime/real/dlms-aarq-lls.ts` — LLS AARQ payload builder.
- `lib/runtime/real/dlms-get-normal.ts` — GET-Request-Normal + response scrape.
- Outbound probe under `lib/runtime/real/` remains the **diagnostic** TCP client path.

## Next implementation steps

- **Primary:** Follow **[protocol-runtime-handoff.md](protocol-runtime-handoff.md)** — freeze ingress micro-tweaks; introduce a **sidecar** (Python / MVP-AMI-class) for on-wire sessions; keep Next.js as control plane and API envelope.
- **Ingress (optional):** retain listener + status routes for **diagnostics** only unless field topology mandates inbound TCP and a gateway is proven compatible.
- **Later (post–sidecar):** stronger COSEM parsing, segmentation, RR/RNR, and ingest persistence — owned by the protocol runtime or shared libraries, not duplicated in the ingress experiment path.
