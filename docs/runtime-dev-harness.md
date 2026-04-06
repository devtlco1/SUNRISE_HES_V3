# Developer runtime test harness

## Purpose

The harness at **`/dev/runtime`** is an **internal** tool to exercise the smart-meter **runtime POST APIs** without wiring actions into production Commands, Connectivity, or meter-detail UX.

It exists so engineers can:

- Manually verify request validation and JSON envelopes.
- See **`simulated: true`** prominently when the **stub** adapter is active.
- See **`ok: false`** and **`REAL_ADAPTER_NOT_WIRED`** when the **real adapter skeleton** is selected.

This is **not** an end-user feature. It is gated in production unless explicitly enabled (see below).

## How to open the page

1. Run the app in development (`npm run dev`) and browse to **`/dev/runtime`**.
2. For **production-like** builds with the page enabled, set **`ALLOW_DEV_RUNTIME_HARNESS=1`** (or `true` / `yes`) and **restart** the server. Otherwise the route shows a short “disabled” message.

The dev layout shows an **INTERNAL** banner so it is visually distinct from operational screens.

## How to use the console

1. Enter a **`meterId`** (required by the API). Default is a sample registry id.
2. Optionally set **`endpointId`** / **`channelHint`** (passed through to the adapter; stub mainly echoes contract shape).
3. Click an action button. Each issues **POST** to the matching **`/api/runtime/...`** route.
4. Read **Adapter status** at the top (from **`GET /api/runtime/status`**).
5. Inspect **Last result**: structured fields, error block if present, and raw JSON.

**Loading:** Buttons disable while a request is in flight.

## Adapter modes (`RUNTIME_ADAPTER`)

| Value    | Effective adapter        | Typical HTTP JSON outcome                                      |
| -------- | ------------------------ | -------------------------------------------------------------- |
| *(unset)* | `StubRuntimeAdapter`     | `ok: true`, `simulated: true`, payload from simulator JSON     |
| `stub`   | `StubRuntimeAdapter`     | Same as above                                                  |
| `real`   | `RealRuntimeAdapter`     | `ok: false`, `simulated: false`, `error.code: REAL_ADAPTER_NOT_WIRED` |
| `dlms`   | `RealRuntimeAdapter`     | Alias of **`real`** (skeleton only; **no** live DLMS)         |
| anything else | Falls back to **stub** | Warning in server logs; status API shows **unknown** + warning |

Default remains **stub**. Changing `RUNTIME_ADAPTER` requires a **server restart**.

## What “real adapter skeleton” means

`lib/runtime/real-runtime-adapter.ts` implements **`SmartMeterRuntimeAdapter`** but **does not** open sockets, run HDLC, or perform COSEM. Every method returns a typed envelope with:

- `ok: false`
- `simulated: false` (meaning: not the stub simulator — **not** “verified hardware”)
- `error.code === "REAL_ADAPTER_NOT_WIRED"`

So the **routes stay honest**: they never imply a successful live meter operation while on the skeleton.

## Current limitations (before hardware)

- No verified smart-meter connectivity in this repository.
- No DLMS association, no real register read, no physical relay control.
- Stub data is defined in **`data/runtime-simulator.json`** only.

## Related docs

- **`docs/runtime-boundary.md`** — contracts, envelopes, file map, and future DLMS integration notes.

## Recommended first real hardware validation order

When a real transport is implemented inside **`RealRuntimeAdapter`** (or a successor class), validate in this order:

1. Probe connection  
2. Associate  
3. Read identity  
4. Read clock  
5. Read basic registers  
6. Relay actions **only after** the above are verified and policy allows  
