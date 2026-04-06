# Smart meter runtime boundary (v1)

## Purpose

This layer defines **typed contracts** and a **replaceable adapter** between the HES application (dashboard, future job runners) and **smart-meter runtime operations** (probe, association, reads, relay-oriented workflows).

It exists **before** any verified live DLMS/COSEM transport so that:

- API and domain shapes stay stable while the implementation moves from **stub → real protocol**.
- UI and aggregation code do not need to be rewritten when a real adapter is introduced.
- All current behavior is explicitly **simulated** and traceable to `data/runtime-simulator.json`.

## Current status (pre-verified DLMS)

- **No** verified DLMS/COSEM **on-wire proof** in this repository (`verifiedOnWire` remains **false** everywhere today).
- **Default adapter:** **`StubRuntimeAdapter`** when `RUNTIME_ADAPTER` is unset or `stub`.
- **Stub:** **`simulated: true`**, **`diagnostics.outcome: simulated_success`**, **`verifiedOnWire: false`**; data from **`data/runtime-simulator.json`**.
- **Real adapter (`RealRuntimeAdapter`):** modular code under **`lib/runtime/real/`**.
  - **Probe:** optional **TCP** connect to **`RUNTIME_PROBE_HOST`** + **`RUNTIME_PROBE_PORT`** (opt-in). Success ⇒ **`ok: true`**, **`diagnostics.outcome: transport_reachable_unverified`**, **`verifiedOnWire: false`** — **not** a meter or DLMS confirmation. If env unset ⇒ **`not_attempted`**. TCP failure ⇒ **`attempted_failed`**.
  - **Associate / identity / clock / registers / relay:** **`not_implemented`** envelopes with stable **`error.code`** values (no COSEM, no relay hardware).

Relay (stub) remains **simulated acceptance** only. Real relay methods return **`not_implemented`**.

## Adapter selection

Environment variable **`RUNTIME_ADAPTER`**:

- **`stub`** or unset → `StubRuntimeAdapter`.
- **`real`** or **`dlms`** → `RealRuntimeAdapter` (staged; optional TCP probe only; **no** DLMS).
- **Unknown value** → fallback to stub + server warning; see **`GET /api/runtime/status`** for `configuredMode: "unknown"`.

## Developer harness

Internal UI: **`/dev/runtime`** (see **`docs/runtime-dev-harness.md`**). Gated in production unless **`ALLOW_DEV_RUNTIME_HARNESS`** is set. Not linked from the main operational sidebar.

## Supported operations

| Operation            | HTTP route                                      | Adapter method          |
| -------------------- | ----------------------------------------------- | ----------------------- |
| Probe connection     | `POST /api/runtime/probe`                       | `probeConnection`       |
| Associate            | `POST /api/runtime/associate`                   | `associate`             |
| Read identity        | `POST /api/runtime/read-identity`               | `readIdentity`          |
| Read clock           | `POST /api/runtime/read-clock`                  | `readClock`             |
| Read basic registers | `POST /api/runtime/read-basic-registers`        | `readBasicRegisters`    |
| Relay disconnect     | `POST /api/runtime/relay-disconnect`            | `disconnectRelay`       |
| Relay reconnect      | `POST /api/runtime/relay-reconnect`             | `reconnectRelay`        |
| Adapter status (dev) | `GET /api/runtime/status`                       | _(none — metadata only)_ |

All **action** routes expect a JSON body:

```json
{
  "meterId": "hes-mt-10021",
  "endpointId": "optional-string",
  "channelHint": "optional-string"
}
```

Invalid JSON or body shape → **400** with `{ error, message? }`. Unexpected server/adapter throws → **500** with `{ error, message? }`.

**`GET /api/runtime/status`** — read-only JSON describing configured vs effective adapter and whether responses are simulator-backed (for dev tooling).

## Response envelope conventions

Responses follow `RuntimeResponseEnvelope` in `types/runtime.ts`:

- `ok` — stub success paths use `true`; real adapter uses `true` only for **TCP probe success** (still not DLMS-verified); otherwise `false` for not-implemented / failed probe.
- `simulated` — **`true`** on stub; **`false`** on real path (means “not stub,” **not** “verified hardware”).
- `operation` — discriminant matching the logical operation name.
- `meterId` — echoed target identifier.
- `startedAt` / `finishedAt` — ISO-8601 timestamps.
- `durationMs` — elapsed wall time for the handler (stub includes a small bounded delay for realism).
- `message` — human-readable, **non-deceptive** description.
- `transportState` / `associationState` — high-level hints (real TCP probe success may use `transportState: connected` without association).
- `payload` — operation-specific data; probe includes **`probeKind`**: `simulator` | `tcp_socket` | `none`.
- `error` — structured error when `ok: false` (stable `code` values on the real adapter).
- **`diagnostics`** (optional but set by current adapters) — **`RuntimeExecutionDiagnostics`**: `outcome`, `capabilityStage`, `transportAttempted`, `associationAttempted`, **`verifiedOnWire`**, optional `detailCode`. Use this for staging and the dev harness.

Types are mirrored in `lib/runtime/contracts.ts` (including the simulator file shape) and the adapter interface in `lib/runtime/runtime-adapter.ts`.

## What must change for real DLMS integration

1. Extend **`lib/runtime/real/`** (e.g. HDLC, `association-stage.ts`, `cosem-reads-stage.ts`) — replace **`not_implemented`** returns with real protocol flows.
2. When the stack can **prove** a COSEM/DLMS result, set **`diagnostics.verifiedOnWire: true`**, **`diagnostics.outcome: verified_on_wire_success`**, and populate **`payload`** with meter-sourced data. Until then, keep **`verifiedOnWire: false`**.
3. Keep **`error`** / **`detailCode`** stable and specific (timeouts, NACK, security rejections).
4. Relay: implement only after reads and policy gates; update **`relay-stage.ts`** last.
5. Keep **HTTP route handlers thin** — validate input, call the adapter, return JSON.

## Next milestone after TCP probe

Implement **DLMS application association** in the real path (e.g. AARQ/AARE or stack wrapper), then **read identity** as the first COSEM read — still updating **`verifiedOnWire`** only when the implementation can honestly assert on-wire verification.

Do **not** couple DLMS types to React components; keep protocol details inside the adapter implementation.

## Recommended first real hardware validation order

1. **Probe connection** — link up, round-trip, and basic reachability.
2. **Association** — application context and security as required by the meter.
3. **Read identity** — serial, logical device name, firmware sanity check.
4. **Read clock** — time sync and skew policy.
5. **Read basic registers** — a small, agreed OBIS set before expanding.
6. **Relay control** — only after reads are stable; treat as high-risk and policy-gated.

## Files (reference)

- `types/runtime.ts` — domain types and envelope.
- `lib/runtime/contracts.ts` — request validation, simulator JSON typing.
- `lib/runtime/runtime-adapter.ts` — adapter interface.
- `lib/runtime/stub-runtime-adapter.ts` — deterministic stub.
- `lib/runtime/real-runtime-adapter.ts` — real adapter façade (delegates to `lib/runtime/real/*`).
- `lib/runtime/real/` — transport config, TCP probe, probe/association/COSEM/relay **stages**, envelope helpers.
- `lib/runtime/adapter-mode.ts` — env parsing and status DTO for `GET /api/runtime/status`.
- `lib/runtime/runtime-factory.ts` — adapter resolution.
- `lib/runtime/post-action.ts` — shared POST wiring for API routes.
- `app/api/runtime/status/route.ts` — adapter status (dev).
- `app/dev/runtime/page.tsx` — internal harness entry.
- `components/dev/dev-runtime-harness.tsx` — harness client UI.
- `lib/dev/runtime-harness-allowed.ts` — production gate for `/dev/runtime`.
- `data/runtime-simulator.json` — stub data only.
- `docs/runtime-dev-harness.md` — how to use the harness.
