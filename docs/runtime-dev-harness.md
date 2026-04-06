# Developer runtime test harness

## Purpose

The harness at **`/dev/runtime`** is an **internal** tool to exercise the smart-meter **runtime POST APIs** without wiring actions into production Commands, Connectivity, or meter-detail UX.

It exists so engineers can:

- Manually verify request validation and JSON envelopes.
- See **`simulated: true`** and **`diagnostics.outcome: simulated_success`** when the **stub** adapter is active.
- See **`diagnostics`** on the **real** adapter: **`not_attempted`**, **`not_implemented`**, **`attempted_failed`**, **`transport_reachable_unverified`** (TCP probe), or **`verified_on_wire_success`** after **associate** when an **AARE** with **association-result 0** is parsed. **`verifiedOnWire: true`** only in that associate success case (not for TCP-only probe).

This is **not** an end-user feature. It is gated in production unless explicitly enabled (see below).

## How to open the page

1. Run the app in development (`npm run dev`) and browse to **`/dev/runtime`**.
2. For **production-like** builds with the page enabled, set **`ALLOW_DEV_RUNTIME_HARNESS=1`** (or `true` / `yes`) and **restart** the server. Otherwise the route shows a short “disabled” message.

The dev layout shows an **INTERNAL** banner so it is visually distinct from operational screens.

## How to use the console

1. Enter a **`meterId`** (required by the API). Default is a sample registry id.
2. Optionally set **`endpointId`** / **`channelHint`** (passed through for future use; TCP probe uses env vars below).
3. Click an action button. Each issues **POST** to the matching **`/api/runtime/...`** route.
4. Read **Adapter status** at the top (from **`GET /api/runtime/status`**).
5. Inspect **Last result**: **`diagnostics`** block, structured fields, **`error`** if present, payload, raw JSON.

**Loading:** Buttons disable while a request is in flight.

## Optional TCP probe (real adapter only)

When **`RUNTIME_ADAPTER=real`** (or **`dlms`**), **probe** may open a **TCP** socket if both are set:

- **`RUNTIME_PROBE_HOST`** — hostname or IP (lab gateway / concentrator / test host).
- **`RUNTIME_PROBE_PORT`** — `1`–`65535`.
- **`RUNTIME_PROBE_TIMEOUT_MS`** — optional (`100`–`120000`, default `5000`).

If host/port are **unset**, probe returns **`ok: false`**, **`diagnostics.outcome: not_attempted`**, **`PROBE_TARGET_NOT_CONFIGURED`**.

If TCP succeeds: **`ok: true`**, **`diagnostics.outcome: transport_reachable_unverified`**, **`verifiedOnWire: false`** — this is **not** DLMS and **not** proof of a smart meter.

## DLMS associate (real adapter)

Uses the same **`RUNTIME_PROBE_*`** TCP target. Optional HDLC logical addresses:

- **`RUNTIME_DLMS_HDLC_SERVER_LOGICAL`** — default **`1`**
- **`RUNTIME_DLMS_HDLC_CLIENT_LOGICAL`** — default **`16`**
- **`RUNTIME_DLMS_READ_MAX_MS`** — max wait per read burst (default **12000**)
- **`RUNTIME_DLMS_READ_IDLE_MS`** — idle gap to end a burst (default **400**)

Flow: **SNRM → UA → I-frame (LLC + AARQ) → parse AARE**. **`verifiedOnWire: true`** only if **association-result** enum **0** appears in the parsed AARE. The adapter sends **DISC** after the attempt (no read session kept).

Runtime API routes use **`export const runtime = "nodejs"`** because of Node **`net`**.

## Adapter modes (`RUNTIME_ADAPTER`)

| Value         | Effective adapter     | Notes |
| ------------- | --------------------- | ----- |
| *(unset)*     | `StubRuntimeAdapter`  | `simulated: true`, simulator JSON |
| `stub`        | `StubRuntimeAdapter`  | Same |
| `real`        | `RealRuntimeAdapter`  | TCP probe + **HDLC associate** when probe env set; reads/relay **`not_implemented`** |
| `dlms`        | `RealRuntimeAdapter`  | Alias of **`real`** |
| anything else | Falls back to **stub** | Server warning; status API **unknown** |

Default remains **stub**. Changing env requires a **server restart**.

## What the real adapter path is today

- **`lib/runtime/real-runtime-adapter.ts`** — thin façade.
- **`lib/runtime/real/probe-connection.ts`** — optional TCP reachability.
- **`lib/runtime/real/association-stage.ts`** — **`runRealAssociate`** (HDLC + AARQ/AARE).
- **`cosem-reads-stage.ts`**, **`relay-stage.ts`** — **`not_implemented`** on the real path.

**`verifiedOnWire: true`** is possible **only** after a successful **AARE** parse on **associate**; it is **not** implied by TCP or probe alone.

## Current limitations

- **AARQ** is a minimal **no dedicated security** profile; many production meters require **auth/ciphering** — then associate returns **`attempted_failed`** / missing AARE until those layers exist.
- **HDLC** uses **1-byte** logical addresses only in this revision.
- No **read identity / clock / registers** and no **relay** on the real path yet.
- Stub data remains **`data/runtime-simulator.json`** only.

## Related docs

- **`docs/runtime-boundary.md`** — contracts, `diagnostics`, file map, integration notes.

## Recommended first real hardware validation order

When implementing the real stack, validate in this order:

1. Probe connection (transport — today: optional TCP only)  
2. Associate  
3. Read identity  
4. Read clock  
5. Read basic registers  
6. Relay actions **only after** the above are verified and policy allows  

**Next milestone:** **read identity** over the same HDLC session policy (reconnect or keep-alive), then clock/registers; relay last.
